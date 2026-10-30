#!/usr/bin/env node
// Run locally; never binds a public network interface and never schedules searches.
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createLocalServer} from './local-server.mjs';
const python=fileURLToPath(new URL('./.venv/'+(process.platform==='win32'?'Scripts/python.exe':'bin/python'),import.meta.url));
if(!process.env.FLI_PYTHON&&existsSync(python))process.env.FLI_PYTHON=python;
const portRaw=process.env.FLIGHT_LOCAL_PORT??'8765';
const port=Number(portRaw);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('FLIGHT_LOCAL_PORT must be a valid unprivileged port');
const server=createLocalServer();
server.listen(port,'127.0.0.1',()=>{
 process.stdout.write('FLIGHT-1 local development dashboard: http://127.0.0.1:'+port+'/dashboard/\n');
 process.stdout.write('Only local requests. No search runs until submitted. Ctrl+C to stop.\n');
});
server.on('error',()=>{process.stderr.write('Local port unavailable; set FLIGHT_LOCAL_PORT to an unused port.\n');process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
