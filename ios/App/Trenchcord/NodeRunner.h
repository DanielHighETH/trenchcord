#ifndef NodeRunner_h
#define NodeRunner_h

#import <Foundation/Foundation.h>

@interface NodeRunner : NSObject

/**
 * Starts the embedded Node.js runtime. Blocks for the lifetime of the process,
 * so it must be called on a dedicated thread.
 *
 * `arguments` is a argv-style list: the first element is ignored by convention
 * ("node"), the second is the path to the script to run.
 *
 * nodejs-mobile permits exactly one engine per process and it cannot be
 * restarted after it exits — if this returns, the app has to be relaunched.
 */
+ (void)startEngineWithArguments:(NSArray<NSString *> *)arguments;

@end

#endif /* NodeRunner_h */
