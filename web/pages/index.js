// The tools of Library Studio, in the order of the sidebar. Each page: { id, title, icon, desc, render(ctx) }.
import { overview } from "./overview.js";
import { cluster } from "./cluster.js";
import { citations } from "./citations.js";
import { links } from "./links.js";
import { exportPage } from "./export.js";
import { enrich } from "./enrich.js";

export const TOOLS = [overview, cluster, citations, enrich, links, exportPage];
