import fs from "node:fs";
import { makeResumeDocx } from "./resume";
const out = process.argv[2];
fs.writeFileSync(out, await makeResumeDocx());
console.log("wrote", out);
