#include <emscripten.h>
#include <libavutil/hwcontext.h>
#include <libavutil/hwcontext_webgpu.h>
#include <libavutil/frame.h>
#include <libavutil/log.h>
#include <libavutil/pixfmt.h>
#include <libavutil/pixdesc.h>
EMSCRIPTEN_KEEPALIVE
const char* get_ffmpeg_version() {
    return av_version_info();
}

EMSCRIPTEN_KEEPALIVE
int test_webgpu_device() {
    AVBufferRef *device_ref = NULL;
    AVBufferRef *frames_ref = NULL;
    AVHWFramesContext *frames_ctx;
    AVFrame *sw_frame  = NULL;
    AVFrame *hw_frame  = NULL;
    AVFrame *dl_frame  = NULL;
    int ret = 0;

    // Check WebGPU type is registered
    enum AVHWDeviceType type = av_hwdevice_find_type_by_name("webgpu");
    av_log(NULL, AV_LOG_INFO, "WebGPU type id: %d\n", type);

    // 1. Create device
    ret = av_hwdevice_ctx_create(&device_ref, AV_HWDEVICE_TYPE_WEBGPU,
                                 NULL, NULL, 0);
    if (ret < 0) {
        av_log(NULL, AV_LOG_ERROR, "Failed to create WebGPU device: %d\n", ret);
        goto fail;
    }
    av_log(NULL, AV_LOG_INFO, "Device OK\n");

    // 2. Create frames context
    frames_ref = av_hwframe_ctx_alloc(device_ref);
    if (!frames_ref) {
        av_log(NULL, AV_LOG_ERROR, "av_hwframe_ctx_alloc failed\n");
        ret = AVERROR(ENOMEM);
        goto fail;
    }
    frames_ctx = (AVHWFramesContext *)frames_ref->data;
    frames_ctx->format    = AV_PIX_FMT_WEBGPU;
    frames_ctx->sw_format = AV_PIX_FMT_RGBA;
    frames_ctx->width     = 64;
    frames_ctx->height    = 64;
    frames_ctx->initial_pool_size = 2;

    av_log(NULL, AV_LOG_INFO, "hw_format=%d sw_format=%d w=%d h=%d\n",
           frames_ctx->format, frames_ctx->sw_format,
           frames_ctx->width, frames_ctx->height);

    ret = av_hwframe_ctx_init(frames_ref);
    av_log(NULL, AV_LOG_INFO, "format name: %s\n", av_get_pix_fmt_name(frames_ctx->format));
    av_log(NULL, AV_LOG_INFO, "AV_PIX_FMT_WEBGPU value: %d\n", AV_PIX_FMT_WEBGPU);
    if (ret < 0) {
        av_log(NULL, AV_LOG_ERROR, "Failed to init frames ctx: %d\n", ret);
        goto fail;
    }
    av_log(NULL, AV_LOG_INFO, "Frames context OK\n");

    // 3. Create CPU frame with checkerboard
    sw_frame = av_frame_alloc();
    sw_frame->format = AV_PIX_FMT_RGBA;
    sw_frame->width  = 64;
    sw_frame->height = 64;
    av_frame_get_buffer(sw_frame, 0);
    for (int y = 0; y < 64; y++) {
        for (int x = 0; x < 64; x++) {
            uint8_t *p = sw_frame->data[0] + y * sw_frame->linesize[0] + x * 4;
            uint8_t v  = ((x / 8 + y / 8) % 2) ? 255 : 0;
            p[0] = v; p[1] = v; p[2] = v; p[3] = 255;
        }
    }
    av_log(NULL, AV_LOG_INFO, "CPU frame OK\n");

    // 4. Upload CPU -> GPU
    hw_frame = av_frame_alloc();
    ret = av_hwframe_get_buffer(frames_ref, hw_frame, 0);
    if (ret < 0) {
        av_log(NULL, AV_LOG_ERROR, "hwframe_get_buffer failed: %d\n", ret);
        goto fail;
    }
    ret = av_hwframe_transfer_data(hw_frame, sw_frame, 0);
    if (ret < 0) {
        av_log(NULL, AV_LOG_ERROR, "Upload failed: %d\n", ret);
        goto fail;
    }
    av_log(NULL, AV_LOG_INFO, "Upload OK\n");

    // 5. Download GPU -> CPU
    dl_frame = av_frame_alloc();
    dl_frame->format = AV_PIX_FMT_RGBA;
    dl_frame->width  = 64;
    dl_frame->height = 64;
    av_frame_get_buffer(dl_frame, 0);
    ret = av_hwframe_transfer_data(dl_frame, hw_frame, 0);
    if (ret < 0) {
        av_log(NULL, AV_LOG_ERROR, "Download failed: %d\n", ret);
        goto fail;
    }
    av_log(NULL, AV_LOG_INFO, "Download OK\n");

    // 6. Verify pixels
    int ok = 1;
    for (int y = 0; y < 64 && ok; y++) {
        for (int x = 0; x < 64 && ok; x++) {
            uint8_t *orig = sw_frame->data[0] + y * sw_frame->linesize[0] + x * 4;
            uint8_t *back = dl_frame->data[0] + y * dl_frame->linesize[0] + x * 4;
            if (orig[0] != back[0] || orig[1] != back[1] || orig[2] != back[2]) {
                av_log(NULL, AV_LOG_ERROR, "MISMATCH at (%d,%d): orig=%d back=%d\n",
                       x, y, orig[0], back[0]);
                ok = 0;
                ret = -1;
            }
        }
    }
    if (ok) av_log(NULL, AV_LOG_INFO, "Pixel verify OK -- round trip clean!\n");

fail:
    av_frame_free(&sw_frame);
    av_frame_free(&hw_frame);
    av_frame_free(&dl_frame);
    av_buffer_unref(&frames_ref);
    av_buffer_unref(&device_ref);
    return ret;
}
