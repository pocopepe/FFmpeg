APITESTPROGS-$(call ENCDEC, FLAC, FLAC) += api-flac
APITESTPROGS-$(call DEMDEC, H264, H264) += api-h264
APITESTPROGS-$(call DEMDEC, H264, H264) += api-h264-slice
APITESTPROGS-yes += api-seek api-dump-stream-meta
APITESTPROGS-$(call DEMDEC, H263, H263) += api-band
APITESTPROGS-$(HAVE_THREADS) += api-threadmessage
APITESTPROGS += $(APITESTPROGS-yes)

APITESTOBJS  := $(APITESTOBJS:%=$(APITESTSDIR)%) $(APITESTPROGS:%=$(APITESTSDIR)/%-test.o)
APITESTPROGS := $(APITESTPROGS:%=$(APITESTSDIR)/%-test$(EXESUF))
-include $(wildcard $(APITESTOBJS:.o=.d))

$(APITESTOBJS): | $(sort $(dir $(APITESTOBJS)))
$(APITESTOBJS) $(APITESTOBJS:.o=.i): CPPFLAGS += -DTEST
$(APITESTOBJS) $(APITESTOBJS:.o=.i): CFLAGS += -Umain

$(APITESTPROGS): %$(EXESUF): %.o $(FF_DEP_LIBS)
	$(call LINK,$(LDFLAGS) $(LDEXEFLAGS) $(LD_O) $(filter %.o,$^) $(FF_EXTRALIBS) $(ELIBS))

testclean::
	$(RM) $(addprefix $(APITESTSDIR)/,$(CLEANSUFFIXES) *-test$(EXESUF))

# WebGPU tests — built with Emscripten separately from the native toolchain.
# Run: make fate-webgpu-build   (requires emcc + emdawnwebgpu port)
WEBGPU_TEST_SRC  = $(SRC_PATH)/tests/api/api-webgpu-test.c
WEBGPU_TEST_OUT  = $(APITESTSDIR)/api-webgpu-test.js
WEBGPU_BUILD_DIR = $(SRC_PATH)/build

fate-webgpu-build: $(WEBGPU_TEST_OUT)

$(WEBGPU_TEST_OUT): $(WEBGPU_TEST_SRC)
	emcc $< \
	    -I$(SRC_PATH) \
	    -I$(WEBGPU_BUILD_DIR)/include \
	    -L$(WEBGPU_BUILD_DIR)/lib \
	    -lavfilter -lavcodec -lavformat -lavutil -lswscale -lswresample \
	    --use-port=emdawnwebgpu \
	    -s ASYNCIFY \
	    -s MODULARIZE=1 \
	    -s EXPORT_NAME="FFmpegWebGPUTest" \
	    -s EXPORTED_RUNTIME_METHODS='["ccall"]' \
	    -s INITIAL_MEMORY=67108864 \
	    -s ALLOW_MEMORY_GROWTH=1 \
	    -O2 \
	    -o $@

testclean::
	$(RM) $(APITESTSDIR)/api-webgpu-test.js $(APITESTSDIR)/api-webgpu-test.wasm
