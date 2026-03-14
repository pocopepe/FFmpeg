/*
 * This file is part of FFmpeg.
 *
 * FFmpeg is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 */

#ifndef AVUTIL_HWCONTEXT_WEBGPU_H
#define AVUTIL_HWCONTEXT_WEBGPU_H

#include <webgpu/webgpu.h>
#include "frame.h"

/**
 * @file
 * API-specific header for AV_HWDEVICE_TYPE_WEBGPU.
 */

/**
 * Main WebGPU context, allocated as AVHWDeviceContext.hwctx.
 * This holds the persistent connection to the browser's GPU.
 */
typedef struct AVWebGPUDeviceContext {
    WGPUInstance instance;
    WGPUAdapter  adapter;
    WGPUDevice   device;
    WGPUQueue    queue;
} AVWebGPUDeviceContext;

/**
 * Allocated as AVHWFramesContext.hwctx.
 * Defines the properties of the textures being created.
 */
typedef struct AVWebGPUFramesContext {
    WGPUTextureUsage usage;
    WGPUTextureFormat format;
} AVWebGPUFramesContext;

/**
 * The actual hardware frame structure.
 * When a video frame is on the GPU, AVFrame->data[0] will point to this struct.
 */
typedef struct AVWebGPUFrame {
    /**
     * The WebGPU texture containing the image data.
     */
    WGPUTexture texture;

    /**
     * The default view of the texture (used for shaders).
     */
    WGPUTextureView view;
} AVWebGPUFrame;

/**
 * Helper to allocate a WebGPU frame struct.
 */
AVWebGPUFrame *av_webgpu_frame_alloc(void);

#endif /* AVUTIL_HWCONTEXT_WEBGPU_H */
