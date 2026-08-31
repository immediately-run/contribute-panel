// Root component — immediately.run renders the default export of THIS file.
// The source-control sidebar as an app (UI_AS_APPS_SPEC §5.3; migrate-sidebars
// Phase 06): it shows the working-tree diff, the branch lineage, and the open
// PRs (elevated `vcs:read`), arms-then-confirms a working-tree reset (first-party
// `vcs:reset`), and drives the save flow via the streamed `contribute()` call.
// The COW/journal + OAuth token never reach this app — the host derives every
// projection and performs every privileged step; this frame only reacts.
//
// R3-478 — this one program now serves TWO regions and branches on `useRegion()`
// (the devtools `panel.tools`/`mainpane.tools` idiom): the sidebar half, plus
// `mainpane.contribute-diff`, the main-pane surface that renders the selected
// changed file's diff. The two halves are two frames with no shared memory; the
// selection flows over their single §5.6 IPC edge (lib/diffSelection.ts).
import "./index.css";
import { useRegion } from "@immediately-run/sdk";
import SourceControlPanel from "./components/SourceControlPanel";
import DiffPane from "./components/DiffPane";

function App() {
  const region = useRegion();
  if (region === "mainpane.contribute-diff") return <DiffPane />;
  return <SourceControlPanel />;
}

export default App;
