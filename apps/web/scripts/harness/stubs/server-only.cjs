/**
 * `server-only` is a build-time poison pill for client bundles. In a Node
 * script it has no meaning and its real entrypoint throws, so it becomes
 * a no-op.
 */
module.exports = {};
