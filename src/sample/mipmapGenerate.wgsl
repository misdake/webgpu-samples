var<private> pos : array<vec2<f32>, 3> = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(-1.0, 3.0), vec2<f32>(3.0, -1.0));
struct VertexOutput {
  @builtin(position) position : vec4<f32>;
  @location(0) texCoord : vec2<f32>;
};
@stage(vertex)
fn vertexMain(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
  var output : VertexOutput;
  output.texCoord = pos[vertexIndex] * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5);
  output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
  return output;
}
@group(0) @binding(0) var imgSampler : sampler;
@group(0) @binding(1) var img : texture_2d<f32>;
@stage(fragment)
fn fragmentMain(@location(0) texCoord : vec2<f32>) -> @location(0) vec4<f32> {
  return textureSample(img, imgSampler, texCoord);
}
