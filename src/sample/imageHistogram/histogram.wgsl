let SIZE = 16u; //fixed
let ITER = 4u;  //work for each thread
let TILE = 64u; //SIZE * ITER

@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> globalHist : array<atomic<u32>, 256>;

var<workgroup> localHist : array<atomic<u32>, 256>;

@stage(compute) @workgroup_size(SIZE, SIZE, 1u)
fn main(
    @builtin(workgroup_id) WorkGroupID : vec3<u32>,
    @builtin(local_invocation_id) LocalInvocationID : vec3<u32>
) {
    let dims_i : vec2<i32> = textureDimensions(inputTex, 0);
    let dims : vec2<u32> = vec2<u32>(u32(dims_i.x), u32(dims_i.y));

    //计算当前thread在图片上的基准坐标
    let baseCoord = WorkGroupID.xy * vec2<u32>(TILE, TILE) + LocalInvocationID.xy;

    for (var y : u32 = 0u; y < ITER; y = y + 1u) {
      for (var x : u32 = 0u; x < ITER; x = x + 1u) {
        let coord = baseCoord + vec2<u32>(SIZE * x, SIZE * y);
        let f = textureLoad(inputTex, vec2<i32>(i32(coord.x), i32(coord.y)), 0).r;
        let u = u32(round(f * 255.));
        if (all(coord < dims)) {
          atomicAdd(&localHist[u], 1u);
        }
      }
    }

    //同步，保证tile范围全部读取和统计完毕
    workgroupBarrier();

    //遍历256种灰度，原子写入global
    let index = LocalInvocationID.x * 16u + LocalInvocationID.y;
    let v = atomicLoad(&localHist[index]);
    if (v > 0u) {
      atomicAdd(&globalHist[index], v);
    }
}
