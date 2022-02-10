struct Uniforms {
  modelViewProjectionMatrix : mat4x4<f32>;
};
@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_2d_array<f32>;

@group(1) @binding(0) var<uniform> indices : vec2<i32>;

@stage(fragment)
fn main(@location(0) fragUV: vec2<f32>,
        @location(1) fragPosition: vec4<f32>,
        @builtin(position) position: vec4<f32>)
     -> @location(0) vec4<f32> {
  var index : i32 = i32(position.x >= 256.);// ^ i32(modf(position.y * 0.25).fract > .5);
  index = indices[index];
  let texel = textureSample(myTexture, mySampler, fragUV, index);
  return texel;
}
