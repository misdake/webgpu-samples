import { makeSample, SampleInit } from "../../components/SampleLayout";

import histogramWGSL from "./histogram.wgsl";
import fullscreenTexturedQuadWGSL from "../../shaders/fullscreenTexturedQuad.wgsl";

const tileDim = 64;

const init: SampleInit = async ({ canvasRef, gui: _gui }) => {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();

  if (canvasRef.current === null) return;
  const context = canvasRef.current.getContext("webgpu");

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

  const fullscreenQuadPipeline = device.createRenderPipeline({
    vertex: {
      module: device.createShaderModule({
        code: fullscreenTexturedQuadWGSL,
      }),
      entryPoint: "vert_main",
    },
    fragment: {
      module: device.createShaderModule({
        code: fullscreenTexturedQuadWGSL,
      }),
      entryPoint: "frag_main",
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  const sampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
  });

  const img = document.createElement("img");
  img.src = require("../../../assets/img/scene.png");
  await img.decode();
  const imageBitmap = await createImageBitmap(img);

  const [srcWidth, srcHeight] = [imageBitmap.width, imageBitmap.height];
  const inputTexture = device.createTexture({
    size: [srcWidth, srcHeight, 1],
    format: "rgba8unorm",
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

  const histogramResult = device.createBuffer({
    size: 256 * 4,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
  });
  const histogramRead = device.createBuffer({
    size: 256 * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const computeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
          multisampled: false,
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
          hasDynamicOffset: false,
          minBindingSize: 256 * 4,
        },
      },
    ],
  });
  const histogramPipeline = device.createComputePipeline({
    compute: {
      module: device.createShaderModule({
        code: histogramWGSL,
      }),
      entryPoint: "main",
    },
    layout: device.createPipelineLayout({
      bindGroupLayouts: [computeBindGroupLayout],
    }),
  });
  const computeBindGroup = device.createBindGroup({
    layout: computeBindGroupLayout,
    // layout: histogramPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: inputTexture.createView(),
      },
      {
        binding: 1,
        resource: { buffer: histogramResult },
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
        resource: inputTexture.createView(),
      },
    ],
  });

  function frame() {
    // Sample is no longer the active page.
    if (!canvasRef.current) return;

    const commandEncoder = device.createCommandEncoder();

    commandEncoder.clearBuffer(histogramResult, 0, 256 * 4);

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(histogramPipeline);
    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatch(
      Math.ceil(srcWidth / tileDim),
      Math.ceil(srcHeight / tileDim),
    );

    computePass.endPass();

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: "clear",
          loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          storeOp: "store",
        },
      ],
    });

    passEncoder.setPipeline(fullscreenQuadPipeline);
    passEncoder.setBindGroup(0, showResultBindGroup);
    passEncoder.draw(6, 1, 0, 0);
    passEncoder.endPass();

    const TEST_PERF = false;

    if (TEST_PERF) {
      device.queue.submit([commandEncoder.finish()]);
      requestAnimationFrame(frame);
    } else {
      commandEncoder.copyBufferToBuffer(histogramResult, 0, histogramRead, 0, 256 * 4);
      device.queue.submit([commandEncoder.finish()]);
      histogramRead.mapAsync(GPUMapMode.READ).then(() => {
        let buffer = histogramRead.getMappedRange();
        let result = new Uint32Array(buffer);
        let sum = 0;
        for (let u of result) {
          sum += u;
        }
        console.log(`${sum} expected: ${srcWidth * srcHeight}`);
        console.log(result);
        histogramRead.unmap();
        // requestAnimationFrame(frame);
      });
    }
  }

  requestAnimationFrame(frame);
};

const Imagehistogram: () => JSX.Element = () =>
  makeSample({
    name: "Image histogram",
    description:
      "This example shows how to generate histogram of an image using a WebGPU compute shader.",
    gui: true,
    init,
    sources: [
      {
        name: __filename.substr(__dirname.length + 1),
        contents: __SOURCE__,
      },
      {
        name: "./histogram.wgsl",
        contents: histogramWGSL,
        editable: true,
      },
      {
        name: "../../shaders/fullscreenTexturedQuad.wgsl",
        contents: fullscreenTexturedQuadWGSL,
        editable: true,
      },
    ],
    filename: __filename,
  });

export default Imagehistogram;
