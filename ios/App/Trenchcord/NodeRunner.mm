#import "NodeRunner.h"
#include <NodeMobile/NodeMobile.h>

// Thin bridge to nodejs-mobile's node_start(), the single C entry point the
// NodeMobile.framework exports. Swift talks to this through the bridging header.
@implementation NodeRunner

+ (void)startEngineWithArguments:(NSArray<NSString *> *)arguments {
    int argc = (int)arguments.count;
    if (argc < 1) {
        return;
    }

    // node_start takes a mutable char** that stays valid for the run, so the
    // NSStrings are copied into C buffers rather than borrowed.
    char **argv = (char **)malloc(sizeof(char *) * (argc + 1));
    if (argv == NULL) {
        return;
    }
    for (int i = 0; i < argc; i++) {
        const char *utf8 = [arguments[i] UTF8String];
        size_t len = strlen(utf8) + 1;
        argv[i] = (char *)malloc(len);
        strncpy(argv[i], utf8, len);
    }
    argv[argc] = NULL;

    node_start(argc, argv);

    // Only reached if the Node event loop drains or the script throws at the top
    // level. The engine cannot be started again in this process; NodeManager
    // treats the health check failing as the signal to tell the user to relaunch.
    for (int i = 0; i < argc; i++) {
        free(argv[i]);
    }
    free(argv);
}

@end
