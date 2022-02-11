//from https://github.com/toji/web-texture-tool/blob/main/src/webgpu-mipmap-generator.js

import mipmapGenerateWGSL from './mipmapGenerate.wgsl';

export function expectedMipLevelCount(width: number, height: number, depth: number = 0) {
  let size = Math.max(width, height, depth);
  return Math.log2(size) + 1;
}

export class WebGPUMipmapGenerator {
  private device: GPUDevice;
  private sampler: GPUSampler;
  private pipelines: {[key: string]: GPURenderPipeline};
  private mipmapShaderModule: GPUShaderModule;

  constructor(device: GPUDevice) {
    this.device = device;
    this.sampler = device.createSampler({minFilter: 'linear'});
    // We'll need a new pipeline for every texture format used.
    this.pipelines = {};
  }

  private getMipmapPipeline(format) {
    let pipeline = this.pipelines[format];
    if (!pipeline) {
      // Shader modules is shared between all pipelines, so only create once.
      if (!this.mipmapShaderModule) {
        this.mipmapShaderModule = this.device.createShaderModule({
          code: mipmapGenerateWGSL,
        });
      }

      pipeline = this.device.createRenderPipeline({
        vertex: {
          module: this.mipmapShaderModule,
          entryPoint: 'vertexMain',
        },
        fragment: {
          module: this.mipmapShaderModule,
          entryPoint: 'fragmentMain',
          targets: [{format}],
        }
      });
      this.pipelines[format] = pipeline;
    }
    return pipeline;
  }

  /**
   * Generates mipmaps for the given GPUTexture from the data in level 0.
   *
   * @param {GPUTexture} texture - Texture to generate mipmaps for.
   * @param {object} textureDescriptor - GPUTextureDescriptor the texture was created with.
   * @returns {GPUTexture} - The originally passed texture
   */
  generateMipmap(texture: GPUTexture, textureDescriptor: GPUTextureDescriptor) {
    // TODO: Does this need to handle sRGB formats differently?
    const pipeline = this.getMipmapPipeline(textureDescriptor.format);

    if (textureDescriptor.dimension == '3d' || textureDescriptor.dimension == '1d') {
      throw new Error('Generating mipmaps for non-2d textures is currently unsupported!');
    }

    let mipTexture = texture;
    let textureSize = textureDescriptor.size as GPUExtent3DDictStrict;
    const arrayLayerCount = textureSize.depthOrArrayLayers || 1; // Only valid for 2D textures.

    // If the texture was created with RENDER_ATTACHMENT usage we can render directly between mip levels.
    const renderToSource = textureDescriptor.usage & GPUTextureUsage.RENDER_ATTACHMENT;
    if (!renderToSource) {
      // Otherwise we have to use a separate texture to render into. It can be one mip level smaller than the source
      // texture, since we already have the top level.
      const mipTextureDescriptor = {
        size: {
          width: Math.ceil(textureSize.width / 2),
          height: Math.ceil(textureSize.height / 2),
          depthOrArrayLayers: arrayLayerCount,
        },
        format: textureDescriptor.format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT,
        mipLevelCount: textureDescriptor.mipLevelCount - 1,
      };
      mipTexture = this.device.createTexture(mipTextureDescriptor);
    }

    const commandEncoder = this.device.createCommandEncoder({});
    // TODO: Consider making this static.
    const bindGroupLayout = pipeline.getBindGroupLayout(0);

    for (let arrayLayer = 0; arrayLayer < arrayLayerCount; ++arrayLayer) {
      let srcView = texture.createView({
        baseMipLevel: 0,
        mipLevelCount: 1,
        dimension: '2d',
        baseArrayLayer: arrayLayer,
        arrayLayerCount: 1,
      });

      let dstMipLevel = renderToSource ? 1 : 0;
      for (let i = 1; i < textureDescriptor.mipLevelCount; ++i) {
        const dstView = mipTexture.createView({
          baseMipLevel: dstMipLevel++,
          mipLevelCount: 1,
          dimension: '2d',
          baseArrayLayer: arrayLayer,
          arrayLayerCount: 1,
        });

        const passEncoder = commandEncoder.beginRenderPass({
          colorAttachments: [{
            view: dstView,
            loadOp: 'clear',
            loadValue: [0, 0, 0, 0],
            storeOp: 'store'
          }],
        });

        const bindGroup = this.device.createBindGroup({
          layout: bindGroupLayout,
          entries: [{
            binding: 0,
            resource: this.sampler,
          }, {
            binding: 1,
            resource: srcView,
          }],
        });

        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(3, 1, 0, 0);
        passEncoder.endPass();

        srcView = dstView;
      }
    }

    // If we didn't render to the source texture, finish by copying the mip results from the temporary mipmap texture
    // to the source.
    if (!renderToSource) {
      const mipLevelSize = {
        width: Math.ceil(textureSize.width / 2),
        height: Math.ceil(textureSize.height / 2),
        depthOrArrayLayers: arrayLayerCount,
      };

      for (let i = 1; i < textureDescriptor.mipLevelCount; ++i) {
        commandEncoder.copyTextureToTexture({
          texture: mipTexture,
          mipLevel: i-1,
        }, {
          texture: texture,
          mipLevel: i,
        }, mipLevelSize);

        mipLevelSize.width = Math.ceil(mipLevelSize.width / 2);
        mipLevelSize.height = Math.ceil(mipLevelSize.height / 2);
      }
    }

    this.device.queue.submit([commandEncoder.finish()]);

    if (!renderToSource) {
      mipTexture.destroy();
    }

    return texture;
  }
}
