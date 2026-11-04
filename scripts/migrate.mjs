import {spawnSync} from 'node:child_process';
process.env.WRANGLER_WRITE_LOGS='false';
process.env.WRANGLER_LOG_PATH='.wrangler/logs';
process.env.MINIFLARE_REGISTRY_PATH='.wrangler/registry';
const args=['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--config','wrangler.local.json'];
if(process.env.QA_STATE_DIR)args.push('--persist-to',process.env.QA_STATE_DIR);
const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});
process.exit(result.status??1);
