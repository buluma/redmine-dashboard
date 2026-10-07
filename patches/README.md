# Dependency patches

`braces@3.0.3.patch` adds a 100-level nesting limit to the parser. The
upstream package has no patched release for GHSA-vfj7-8cjw-p6xm, so the audit
script ignores that advisory only while this patch is applied. Remove both the
patch and the ignore when an upstream fixed release is available.
