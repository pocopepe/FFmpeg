/*
 * WebGPU FFmpeg WASM — benchmark entry point.
 * Tests live in tests/api/api-webgpu-test.c.
 * Build with build_wasm.sh.
 */

#include <emscripten.h>
#include <libavutil/hwcontext.h>
#include <libavutil/hwcontext_webgpu.h>
#include <libavutil/frame.h>
#include <libavutil/log.h>
#include <libavutil/pixfmt.h>
#include <libavfilter/avfilter.h>
#include <libavfilter/buffersink.h>
#include <libavfilter/buffersrc.h>
#include <libswscale/swscale.h>

EMSCRIPTEN_KEEPALIVE
const char *get_ffmpeg_version(void) { return av_version_info(); }

/* ----------------------------------------------------------------- helpers */

static int make_webgpu_device(AVBufferRef **out)
{
    return av_hwdevice_ctx_create(out, AV_HWDEVICE_TYPE_WEBGPU, NULL, NULL, 0);
}

static int make_webgpu_frames(AVBufferRef *device_ref, int w, int h,
                               AVBufferRef **out)
{
    AVBufferRef *ref = av_hwframe_ctx_alloc(device_ref);
    if (!ref) return AVERROR(ENOMEM);
    AVHWFramesContext *fc = (AVHWFramesContext *)ref->data;
    fc->format = AV_PIX_FMT_WEBGPU; fc->sw_format = AV_PIX_FMT_RGBA;
    fc->width = w; fc->height = h; fc->initial_pool_size = 4;
    int ret = av_hwframe_ctx_init(ref);
    if (ret < 0) { av_buffer_unref(&ref); return ret; }
    *out = ref;
    return 0;
}

static AVFrame *make_gradient_hw_frame(AVBufferRef *frames_ref, int w, int h)
{
    AVFrame *sw = av_frame_alloc();
    if (!sw) return NULL;
    sw->format = AV_PIX_FMT_RGBA; sw->width = w; sw->height = h;
    if (av_frame_get_buffer(sw, 0) < 0) { av_frame_free(&sw); return NULL; }
    for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++) {
            uint8_t *p = sw->data[0] + y * sw->linesize[0] + x * 4;
            p[0] = (uint8_t)(x * 255 / (w-1)); p[1] = (uint8_t)(y * 255 / (h-1));
            p[2] = 128; p[3] = 255;
        }
    AVFrame *hw = av_frame_alloc();
    if (!hw || av_hwframe_get_buffer(frames_ref, hw, 0) < 0 ||
        av_hwframe_transfer_data(hw, sw, 0) < 0) {
        av_frame_free(&sw); av_frame_free(&hw); return NULL;
    }
    av_frame_free(&sw);
    return hw;
}

static int build_scale_graph(AVFilterContext **src_out, AVFilterContext **sink_out,
                              AVFilterGraph **graph_out, AVBufferRef *frames_ref,
                              int src_w, int src_h, int dst_w, int dst_h)
{
    const AVFilter *bsrc  = avfilter_get_by_name("buffer");
    const AVFilter *bsink = avfilter_get_by_name("buffersink");
    const AVFilter *scale = avfilter_get_by_name("scale_webgpu");
    if (!scale) return AVERROR_FILTER_NOT_FOUND;

    AVFilterGraph *graph = avfilter_graph_alloc();
    if (!graph) return AVERROR(ENOMEM);

    char src_args[128], scale_args[64];
    snprintf(src_args, sizeof(src_args),
             "video_size=%dx%d:pix_fmt=%d:time_base=1/25:pixel_aspect=1/1",
             src_w, src_h, AV_PIX_FMT_WEBGPU);
    snprintf(scale_args, sizeof(scale_args), "w=%d:h=%d", dst_w, dst_h);

    AVFilterContext *src_ctx = NULL, *scale_ctx = NULL, *sink_ctx = NULL;
    int ret;
    ret = avfilter_graph_create_filter(&src_ctx,   bsrc,  "in",    src_args,   NULL, graph); if (ret < 0) goto fail;
    ((FilterLink *)src_ctx->outputs[0])->hw_frames_ctx = av_buffer_ref(frames_ref);
    ret = avfilter_graph_create_filter(&scale_ctx, scale, "scale", scale_args, NULL, graph); if (ret < 0) goto fail;
    ret = avfilter_graph_create_filter(&sink_ctx,  bsink, "out",   NULL,       NULL, graph); if (ret < 0) goto fail;
    ret = avfilter_link(src_ctx, 0, scale_ctx, 0);  if (ret < 0) goto fail;
    ret = avfilter_link(scale_ctx, 0, sink_ctx, 0); if (ret < 0) goto fail;
    ret = avfilter_graph_config(graph, NULL);        if (ret < 0) goto fail;
    *src_out = src_ctx; *sink_out = sink_ctx; *graph_out = graph;
    return 0;
fail:
    avfilter_graph_free(&graph);
    return ret;
}

/* ---------------------------------------------------------------- benches */

/*
 * Returns average wall-clock ms per frame for scale_webgpu src→dst.
 * GPU sync is forced by one CPU readback after all iterations.
 * Returns -1.0 on error.
 */
EMSCRIPTEN_KEEPALIVE
double bench_scale_webgpu(int src_w, int src_h, int dst_w, int dst_h, int iterations)
{
    AVBufferRef    *device_ref = NULL, *frames_ref = NULL;
    AVFrame        *hw = NULL, *scaled = NULL, *dl = NULL;
    AVFilterGraph  *graph    = NULL;
    AVFilterContext *src_ctx = NULL, *sink_ctx = NULL;
    double result = -1.0;

    if (make_webgpu_device(&device_ref) < 0) goto fail;
    if (make_webgpu_frames(device_ref, src_w, src_h, &frames_ref) < 0) goto fail;
    hw = make_gradient_hw_frame(frames_ref, src_w, src_h);
    if (!hw) goto fail;
    if (build_scale_graph(&src_ctx, &sink_ctx, &graph,
                           frames_ref, src_w, src_h, dst_w, dst_h) < 0) goto fail;

    double t0 = emscripten_get_now();
    for (int i = 0; i < iterations; i++) {
        if (av_buffersrc_add_frame_flags(src_ctx, hw, AV_BUFFERSRC_FLAG_KEEP_REF) < 0) goto fail;
        scaled = av_frame_alloc();
        if (av_buffersink_get_frame(sink_ctx, scaled) < 0) { av_frame_free(&scaled); goto fail; }
        av_frame_free(&scaled);
    }

    /* Force GPU→CPU sync via one readback */
    if (av_buffersrc_add_frame_flags(src_ctx, hw, AV_BUFFERSRC_FLAG_KEEP_REF) < 0) goto fail;
    scaled = av_frame_alloc();
    av_buffersink_get_frame(sink_ctx, scaled);
    dl = av_frame_alloc();
    dl->format = AV_PIX_FMT_RGBA; dl->width = dst_w; dl->height = dst_h;
    av_frame_get_buffer(dl, 0);
    av_hwframe_transfer_data(dl, scaled, 0);
    av_frame_free(&scaled);

    result = (emscripten_get_now() - t0) / iterations;

fail:
    avfilter_graph_free(&graph);
    av_frame_free(&hw); av_frame_free(&dl);
    av_buffer_unref(&frames_ref); av_buffer_unref(&device_ref);
    return result;
}

/*
 * Returns average wall-clock ms per frame for swscale (CPU bilinear) src→dst.
 * Returns -1.0 on error.
 */
EMSCRIPTEN_KEEPALIVE
double bench_scale_cpu(int src_w, int src_h, int dst_w, int dst_h, int iterations)
{
    AVFrame *src = av_frame_alloc(), *dst = av_frame_alloc();
    double result = -1.0;
    if (!src || !dst) goto fail;

    src->format = AV_PIX_FMT_RGBA; src->width = src_w; src->height = src_h;
    if (av_frame_get_buffer(src, 0) < 0) goto fail;
    for (int y = 0; y < src_h; y++)
        for (int x = 0; x < src_w; x++) {
            uint8_t *p = src->data[0] + y * src->linesize[0] + x * 4;
            p[0] = (uint8_t)(x*255/(src_w-1)); p[1] = (uint8_t)(y*255/(src_h-1));
            p[2] = 128; p[3] = 255;
        }

    dst->format = AV_PIX_FMT_RGBA; dst->width = dst_w; dst->height = dst_h;
    if (av_frame_get_buffer(dst, 0) < 0) goto fail;

    struct SwsContext *sws = sws_getContext(src_w, src_h, AV_PIX_FMT_RGBA,
                                            dst_w, dst_h, AV_PIX_FMT_RGBA,
                                            SWS_BILINEAR, NULL, NULL, NULL);
    if (!sws) goto fail;

    double t0 = emscripten_get_now();
    for (int i = 0; i < iterations; i++)
        sws_scale(sws, (const uint8_t *const *)src->data, src->linesize, 0, src_h,
                  dst->data, dst->linesize);
    result = (emscripten_get_now() - t0) / iterations;
    sws_freeContext(sws);

fail:
    av_frame_free(&src); av_frame_free(&dst);
    return result;
}
