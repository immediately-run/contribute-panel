// Root component — immediately.run renders the default export of THIS file.
// The source-control sidebar as an app (UI_AS_APPS_SPEC §5.3; migrate-sidebars
// Phase 06): it shows the working-tree diff, the branch lineage, and the open
// PRs (elevated `vcs:read`), arms-then-confirms a working-tree reset (first-party
// `vcs:reset`), and drives the save flow via the streamed `contribute()` call.
// The COW/journal + OAuth token never reach this app — the host derives every
// projection and performs every privileged step; this frame only reacts.
import "./index.css";
import SourceControlPanel from "./components/SourceControlPanel";

function App() {
  return <SourceControlPanel />;
}

export default App;
