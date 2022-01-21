let TILE = 16;
let BLOCK = 12;
let FILTER = 5;
let FILTER_OFFSET = 2;
let FILTER_LEN = 25;
let FILTER_MEDIAN = 13;

//[[group(0), binding(0)]] var samp : sampler; //改用textureLoad来读取，就不需要sampler了
[[group(0), binding(0)]] var inputTex : texture_2d<f32>;
[[group(0), binding(1)]] var outputTex : texture_storage_2d<rgba8unorm, write>;

var<workgroup> tile : array<array<f32, TILE>, TILE>;

[[stage(compute), workgroup_size(TILE, TILE, 1)]]
fn main(
    [[builtin(workgroup_id)]] WorkGroupID : vec3<u32>,
    [[builtin(local_invocation_id)]] LocalInvocationID : vec3<u32>
) {
    let dims : vec2<i32> = textureDimensions(inputTex, 0);
    let dims_max : vec2<i32> = dims - vec2<i32>(1, 1);

    //计算当前thread在图片上的坐标
    let localCoord = vec2<i32>(i32(LocalInvocationID.x), i32(LocalInvocationID.y));
    let coord = vec2<i32>(WorkGroupID.xy * vec2<u32>(u32(BLOCK), u32(BLOCK)) + LocalInvocationID.xy) - vec2<i32>(FILTER_OFFSET, FILTER_OFFSET);

    //读数据到shared memory
    //tile[localCoord.x][localCoord.y] = textureSampleLevel(inputTex, samp, vec2<f32>(coord) / vec2<f32>(dims), 0.0).r; //改用textureLoad来读取
    tile[localCoord.x][localCoord.y] = textureLoad(inputTex, clamp(coord, vec2<i32>(0, 0), vec2<i32>(dims_max)), 0).r;

    //同步，保证全部读取结束
    workgroupBarrier();

    let min = vec2<u32>(u32(FILTER_OFFSET), u32(FILTER_OFFSET));
    let max = vec2<u32>(u32(TILE - FILTER_OFFSET), u32(TILE - FILTER_OFFSET));
    //抛弃外圈的thread，只留下中心有足够数据进行计算的thread
    if (all(LocalInvocationID.xy >= min) && all(LocalInvocationID.xy < max) && all(coord < dims)) {
        var inputs = array<f32, FILTER_LEN>();
        var index = 0;
        for(var i : i32 = -FILTER_OFFSET; i <= FILTER_OFFSET; i = i + 1) {
            for(var j : i32 = -FILTER_OFFSET; j <= FILTER_OFFSET; j = j + 1) {
                inputs[index] = tile[localCoord.x + i][localCoord.y + j];
                index = index + 1; //optimize?
            }
        }
        //将每个备选数字放入数组中

        //冒泡排序，外层循环只做前一半，拿到中位数就够了
        for (var i : i32 = 0; i < FILTER_MEDIAN; i = i + 1) {
            for (var j : i32 = i + 1; j < FILTER_LEN; j = j + 1) {
                if (inputs[i] > inputs[j]) {
                    let tmp = inputs[i];
                    inputs[i] = inputs[j];
                    inputs[j] = tmp;
                }
            }
        }

        let median = inputs[FILTER_MEDIAN - 1];

        textureStore(outputTex, coord, vec4<f32>(median, median, median, 1.0));
    }
}
