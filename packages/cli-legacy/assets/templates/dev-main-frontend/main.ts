import { rootRedirectMount, mountLoaders, mounts } from "./generated/mount-loaders";
import { bootMainFrontend } from "@otavia/cli-legacy/dev/main-frontend-runtime/main-entry";

void bootMainFrontend(rootRedirectMount, mounts, mountLoaders);
