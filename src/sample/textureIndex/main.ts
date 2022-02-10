import { mat4, vec3 } from 'gl-matrix';
import { makeSample, SampleInit } from '../../components/SampleLayout';

import { cubePositionOffset, cubeUVOffset, cubeVertexArray, cubeVertexCount, cubeVertexSize } from '../../meshes/cube';

import basicVertWGSL from '../../shaders/basic.vert.wgsl';
import sampleTextureMixColorWGSL from './sampleTextureMixColor.frag.wgsl';
import mipmapGenerateWGSL from '../mipmapGenerate.wgsl';
import { expectedMipLevelCount, WebGPUMipmapGenerator } from '../mipmap';

const init: SampleInit = async ({ canvasRef }) => {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();

  if (canvasRef.current === null) return;
  const context = canvasRef.current.getContext('webgpu');

  const devicePixelRatio = window.devicePixelRatio || 1;
  const presentationSize = [
    canvasRef.current.clientWidth * devicePixelRatio,
    canvasRef.current.clientHeight * devicePixelRatio,
  ];
  const presentationFormat = context.getPreferredFormat(adapter);

  context.configure({
    device,
    format: presentationFormat,
    size: presentationSize,
  });

  // Create a vertex buffer from the cube data.
  const verticesBuffer = device.createBuffer({
    size: cubeVertexArray.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(verticesBuffer.getMappedRange()).set(cubeVertexArray);
  verticesBuffer.unmap();

  const depthTexture = device.createTexture({
    size: presentationSize,
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const uniformBufferSize = 4 * 16; // 4x4 matrix
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const textureIndicesBufferSize = 512; //2 x 256B blocks
  const textureIndicesBuffer = device.createBuffer({
    mappedAtCreation: true,
    size: textureIndicesBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  let textureIndicesArray = new Int32Array(textureIndicesBuffer.getMappedRange());
  textureIndicesArray.set([0, 1], 0);
  textureIndicesArray.set([1, 0], 64);
  textureIndicesBuffer.unmap();

  async function createTextureArray(files: string[]): Promise<GPUTexture> {
    let promises = files.map(async url => {
      // const img = document.createElement('img');
      // img.src = url;
      // await img.decode();
      // const imageBitmap = await createImageBitmap(img);

      const response = await fetch(url);
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);

      return imageBitmap;
    });

    let images = await Promise.all(promises);

    let first = images[0];
    let textureDescriptor: GPUTextureDescriptor = {
      size: { width: first.width, height: first.height, depthOrArrayLayers: images.length },
      mipLevelCount: expectedMipLevelCount(first.width, first.height),
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    };
    let texture = device.createTexture(textureDescriptor);

    images.forEach((image, i) => {
      device.queue.copyExternalImageToTexture(
        { source: image },
        { texture: texture, origin: { z: i } },
        { width: image.width, height: image.height },
      );
    });

    let mipmapGenerator = new WebGPUMipmapGenerator(device);
    texture = mipmapGenerator.generateMipmap(texture, textureDescriptor);

    return texture;
  }

  // Fetch the image and upload it into a GPUTexture.
  const texture: GPUTexture = await createTextureArray([require('../../../assets/img/Di-3d.png'), require('../../../assets/img/sprite.png')]);

  // Create a sampler with linear filtering for smooth interpolation.
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    maxAnisotropy: 16,
  });

  let uniformBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: {
          type: 'uniform',
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        sampler: {
          type: 'filtering',
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: 'float',
          viewDimension: '2d-array',
        },
      },
    ],
  });
  const uniformBindGroup = device.createBindGroup({
    layout: uniformBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
        },
      },
      {
        binding: 1,
        resource: sampler,
      },
      {
        binding: 2,
        resource: texture.createView({ arrayLayerCount: 2, dimension: '2d-array' }),
      },
    ],
  });

  let dynamicBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: 'uniform',
          hasDynamicOffset: true,
        },
      },
    ],
  });
  const dynamicBindGroup = device.createBindGroup({
    layout: dynamicBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: textureIndicesBuffer,
          offset: 0,
          size: 8,
        },
      },
    ],
  });

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [uniformBindGroupLayout, dynamicBindGroupLayout],
    }),
    vertex: {
      module: device.createShaderModule({
        code: basicVertWGSL,
      }),
      entryPoint: 'main',
      buffers: [
        {
          arrayStride: cubeVertexSize,
          attributes: [
            {
              // position
              shaderLocation: 0,
              offset: cubePositionOffset,
              format: 'float32x4',
            },
            {
              // uv
              shaderLocation: 1,
              offset: cubeUVOffset,
              format: 'float32x2',
            },
          ],
        },
      ],
    },
    fragment: {
      module: device.createShaderModule({
        code: sampleTextureMixColorWGSL,
      }),
      entryPoint: 'main',
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',

      // Backface culling since the cube is solid piece of geometry.
      // Faces pointing away from the camera will be occluded by faces
      // pointing toward the camera.
      cullMode: 'back',
    },

    // Enable depth testing so that the fragment closest to the camera
    // is rendered in front.
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  });

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: undefined, // Assigned later
        loadOp: 'clear',
        loadValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: depthTexture.createView(),

      depthLoadValue: 1.0,
      depthStoreOp: 'store',
      stencilLoadValue: 0,
      stencilStoreOp: 'store',
    },
  };

  const aspect = presentationSize[0] / presentationSize[1];
  const projectionMatrix = mat4.create();
  mat4.perspective(projectionMatrix, (2 * Math.PI) / 5, aspect, 1, 100.0);

  function getTransformationMatrix() {
    const viewMatrix = mat4.create();
    mat4.translate(viewMatrix, viewMatrix, vec3.fromValues(0, 0, -4));
    const now = Date.now() / 1000;
    mat4.rotate(
      viewMatrix,
      viewMatrix,
      1,
      vec3.fromValues(Math.sin(now), Math.cos(now), 0),
    );

    const modelViewProjectionMatrix = mat4.create();
    mat4.multiply(modelViewProjectionMatrix, projectionMatrix, viewMatrix);

    return modelViewProjectionMatrix as Float32Array;
  }

  function frame() {
    // Sample is no longer the active page.
    if (!canvasRef.current) return;

    const transformationMatrix = getTransformationMatrix();
    device.queue.writeBuffer(
      uniformBuffer,
      0,
      transformationMatrix.buffer,
      transformationMatrix.byteOffset,
      transformationMatrix.byteLength,
    );
    renderPassDescriptor.colorAttachments[0].view = context
      .getCurrentTexture()
      .createView();

    let offset = (Date.now() % 4000 > 2000) ? 0 : 256;

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, uniformBindGroup);
    passEncoder.setBindGroup(1, dynamicBindGroup, [offset]);
    passEncoder.setVertexBuffer(0, verticesBuffer);
    passEncoder.draw(cubeVertexCount, 1, 0, 0);
    passEncoder.endPass();
    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
};

const TexturedCube: () => JSX.Element = () =>
  makeSample({
    name: 'Texture Index',
    description: 'This example shows how to select texture in shader.',
    init,
    sources: [
      {
        name: __filename.substr(__dirname.length + 1),
        contents: __SOURCE__,
      },
      {
        name: '../../shaders/basic.vert.wgsl',
        contents: basicVertWGSL,
        editable: true,
      },
      {
        name: '../mipmapGenerateWGSL.wgsl',
        contents: mipmapGenerateWGSL,
        editable: true,
      },
      {
        name: './sampleTextureMixColor.frag.wgsl',
        contents: sampleTextureMixColorWGSL,
        editable: true,
      },
      {
        name: '../../meshes/cube.ts',
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        contents: require('!!raw-loader!../../meshes/cube.ts').default,
      },
    ],
    filename: __filename,
  });

export default TexturedCube;
