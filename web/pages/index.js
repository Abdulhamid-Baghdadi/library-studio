// The tools of Library Studio, in the order of the sidebar. Each page: { id, title, icon, desc, render(ctx) }.
// Citations moved to Scoping Review Workbench (Report → Check citations), which writes `cites`; the tools here read it.
import { overview } from "./overview.js";
import { cluster } from "./cluster.js";
import { links } from "./links.js";
import { exportPage } from "./export.js";
import { enrich } from "./enrich.js";

export const TOOLS = [overview, cluster, enrich, links, exportPage];
