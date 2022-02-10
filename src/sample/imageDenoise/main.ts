import { makeSample, SampleInit } from '../../components/SampleLayout';

import denoiseWGSL from './denoise.wgsl';
import fullscreenTexturedQuadWGSL from '../../shaders/fullscreenTexturedQuad.wgsl';

// Constants from the denoise.wgsl shader.
const tileDim = 16;

const init: SampleInit = async ({ canvasRef, gui }) => {
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

  const denoisePipeline = device.createComputePipeline({
    compute: {
      module: device.createShaderModule({
        code: denoiseWGSL,
      }),
      entryPoint: 'main',
    },
  });

  const fullscreenQuadPipeline = device.createRenderPipeline({
    vertex: {
      module: device.createShaderModule({
        code: fullscreenTexturedQuadWGSL,
      }),
      entryPoint: 'vert_main',
    },
    fragment: {
      module: device.createShaderModule({
        code: fullscreenTexturedQuadWGSL,
      }),
      entryPoint: 'frag_main',
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  const sampler = device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
  });

  const img = document.createElement('img');
  img.src = require('../../../assets/img/noisy.png');
  await img.decode();
  const imageBitmap = await createImageBitmap(img);

  const [srcWidth, srcHeight] = [imageBitmap.width, imageBitmap.height];
  const inputTexture = device.createTexture({
    size: [srcWidth, srcHeight, 1],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture: inputTexture },
    [imageBitmap.width, imageBitmap.height],
  );

  const computeTexture = device.createTexture({
    size: {
      width: srcWidth,
      height: srcHeight,
    },
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING,
  });

  const denoiseParamsBuffer = device.createBuffer({
    size: 8,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });

  const computeBindGroup = device.createBindGroup({
    layout: denoisePipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: inputTexture.createView(),
      },
      {
        binding: 1,
        resource: computeTexture.createView(),
      },
    ],
  });

  const showResultBindGroup = device.createBindGroup({
    layout: fullscreenQuadPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: sampler,
      },
      {
        binding: 1,
        resource: computeTexture.createView(),
      },
    ],
  });

  const settings = {
    filterSize: 5,
  };

  let blockDim: number;
  const updateSettings = () => {
    blockDim = tileDim - (settings.filterSize - 1);
    device.queue.writeBuffer(
      denoiseParamsBuffer,
      0,
      new Uint32Array([settings.filterSize, blockDim]),
    );
  };
  updateSettings();

  function frame() {
    // Sample is no longer the active page.
    if (!canvasRef.current) return;

    const commandEncoder = device.createCommandEncoder();

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(denoisePipeline);
    // computePass.setBindGroup(0, computeConstants);

    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatch(
      Math.ceil(srcWidth / blockDim),
      Math.ceil(srcHeight / blockDim),
    );

    computePass.endPass();

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          storeOp: 'store',
        },
      ],
    });

    passEncoder.setPipeline(fullscreenQuadPipeline);
    passEncoder.setBindGroup(0, showResultBindGroup);
    passEncoder.draw(6, 1, 0, 0);
    passEncoder.endPass();
    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
};

const Imagedenoise: () => JSX.Element = () =>
  makeSample({
    name: 'Image denoise',
    description:
      'This example shows how to denoise an image using a WebGPU compute shader.',
    gui: true,
    init,
    sources: [
      {
        name: __filename.substr(__dirname.length + 1),
        contents: __SOURCE__,
      },
      {
        name: './denoise.wgsl',
        contents: denoiseWGSL,
        editable: true,
      },
      {
        name: '../../shaders/fullscreenTexturedQuad.wgsl',
        contents: fullscreenTexturedQuadWGSL,
        editable: true,
      },
    ],
    filename: __filename,
  });

export default Imagedenoise;
