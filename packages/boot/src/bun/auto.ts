import { AutoArtifactGroup } from './auto-group';
import { AutoArtifactsLoader } from './auto-loader';
import { GroupArtifactsResolver } from './group-resolver';

// Groups a shared package defined without content resolve from source through this resolver.
GroupArtifactsResolver.install();

/** The application's own decorated classes, found by the scanner - pass it in `configs.artifacts`. From source the run-time plugin builds the index when artifacts are registered; in a binary built with `IgnisArtifactsPlugin` this module is replaced by one carrying the built index. */
const AutoArtifacts = new AutoArtifactGroup({ resolve: () => AutoArtifactsLoader.load() });

export default AutoArtifacts;
