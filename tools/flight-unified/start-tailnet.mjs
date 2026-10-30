#!/usr/bin/env node
// Opt-in only. Starts both HTTP servers on 127.0.0.1; does not start Tailscale Serve.
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createLocalServer} from './local-server.mjs';
import {createTailnetGateway,validateTailnetConfig} from './tailnet-gateway.mjs';

const backendPort=Number(process.env.FLIGHT_LOCAL_PORT??'8765');
const gatewayPort=Number(process.env.FLIGHT_TAILNET_PORT??'8766');
const config=validateTailnetConfig({
 hostname:process.env.FLIGHT_TAILNET_HOST,
 user:process.env.FLIGHT_TAILNET_USER,
 backendPort,gatewayPort
});
const python=fileURLToPath(new URL('./.venv/'+(process.platform==='win32'?'Scripts/python.exe':'bin/python'),import.meta.url));
if(!process.env.FLI_PYTHON&&existsSync(python))process.env.FLI_PYTHON=python;
const backend=createLocalServer();
const gateway=createTailnetGateway(config);
backend.listen(backendPort,'127.0.0.1',()=>{
 gateway.listen(gatewayPort,'127.0.0.1',()=>{
  process.stdout.write('Private FLIGHT-1 gateway ready; both servers bound to localhost only.\n');
  process.stdout.write('Run "tailscale serve '+gatewayPort+'" in a second terminal.\n');
  process.stdout.write('Use the HTTPS tailnet URL from Tailscale on your signed-in iPhone.\n');
 });
});
for(const server of [backend,gateway]) server.on('error',()=>{
 process.stderr.write('Local server could not start. Check configured ports and permissions.\n');
 backend.close();gateway.close();process.exitCode=1;
});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{
 gateway.close();backend.close();
});
