// FLIGHT-1 tailnet-only gateway. Strict access gate in front of the unchanged localhost API.
// Requires Tailscale Serve identity headers, single explicit user, and exact tailnet hostname.
import http from 'node:http';

const ASSETS = new Set([
 '/', '/dashboard/', '/dashboard/index.html', '/dashboard/style.css',
 '/dashboard/app.mjs', '/dashboard/demo.mjs', '/compare-ui.mjs', '/api/session'
]);
const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:[.][a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*[.]ts[.]net$/;
const EMAIL = /^[^\s@]+@[^\s@]+[.][^\s@]+$/;
function send(res,status,code){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
 res.end(JSON.stringify({error:code}));
}
export function validateTailnetConfig({hostname,user,backendPort,gatewayPort}){
 const host=String(hostname??'').trim().toLowerCase();
 const login=String(user??'').trim().toLowerCase();
 if(!HOSTNAME.test(host)||host.length>253)throw Error('INVALID_TAILNET_HOST');
 if(!EMAIL.test(login)||login.length>254)throw Error('INVALID_TAILNET_USER');
 for(const [name,port] of [['backendPort',backendPort],['gatewayPort',gatewayPort]]){
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('INVALID_'+name.toUpperCase());
 }
 if(backendPort===gatewayPort)throw Error('PORTS_MUST_DIFFER');
 return {hostname:host,user:login,backendPort,gatewayPort};
}
export function createTailnetGateway(options){
 const config=validateTailnetConfig(options);
 const targetHost='127.0.0.1:'+config.backendPort;
 const remoteOrigin='https://'+config.hostname;
 const server=http.createServer((req,res)=>{
  const address=req.socket.remoteAddress??'';
  if(!['127.0.0.1','::ffff:127.0.0.1','::1'].includes(address))
   return send(res,403,'LOCAL_PROXY_ONLY');
  const host=req.headers.host??'';
  const forwarded=req.headers['x-forwarded-host'];
  const hostOK=host===config.hostname ||
   (host==='127.0.0.1:'+config.gatewayPort && forwarded===config.hostname);
  if(!hostOK)return send(res,403,'UNEXPECTED_HOST');
  if(req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto']!=='https')
   return send(res,403,'HTTPS_REQUIRED');
  const user=req.headers['tailscale-user-login'];
  if(typeof user!=='string'||user.trim().toLowerCase()!==config.user)
   return send(res,403,'TAILNET_IDENTITY_NOT_AUTHORIZED');
  const path=req.url?.split('?')[0]??'';
  const isRead=req.method==='GET'&&ASSETS.has(path);
  const isSearch=req.method==='POST'&&path==='/api/search';
  if(!isRead&&!isSearch)return send(res,404,'NOT_FOUND');
  if(isSearch){
   if(req.headers.origin!==remoteOrigin)return send(res,403,'INVALID_ORIGIN');
   if(req.headers['content-type']?.split(';')[0]!=='application/json')
    return send(res,415,'JSON_REQUIRED');
   const len=Number(req.headers['content-length']);
   if(!Number.isFinite(len)||len<0||len>2048)return send(res,413,'PAYLOAD_TOO_LARGE');
  }
  const headers={Host:targetHost,'Accept':'application/json, text/html, text/css, text/javascript',
   'Cache-Control':'no-store'};
  if(isSearch){
   headers.Origin='http://'+targetHost;
   headers['Content-Type']='application/json';
   if(typeof req.headers['x-flight-local-token']==='string')
    headers['X-Flight-Local-Token']=req.headers['x-flight-local-token'];
  }
  const upstream=http.request({
   hostname:'127.0.0.1',port:config.backendPort,method:req.method,
   path:req.url,headers,timeout:350000
  },reply=>{
   const responseHeaders={};
   for(const key of ['content-type','content-security-policy','cache-control','referrer-policy',
      'x-content-type-options','x-frame-options','location']) {
    if(reply.headers[key])responseHeaders[key]=reply.headers[key];
   }
   responseHeaders['Cache-Control']='no-store';
   res.writeHead(reply.statusCode??502,responseHeaders);
   reply.pipe(res);
  });
  upstream.on('timeout',()=>upstream.destroy(Error('PROXY_TIMEOUT')));
  upstream.on('error',()=>{if(!res.headersSent)send(res,502,'LOCAL_BACKEND_UNAVAILABLE');else res.destroy();});
  if(isSearch){
   let received=0;
   req.on('data',chunk=>{
    received+=chunk.length;
    if(received>2048){
     req.unpipe(upstream);
     upstream.destroy();
     if(!res.headersSent)send(res,413,'PAYLOAD_TOO_LARGE');
    } else upstream.write(chunk);
   });
   req.on('end',()=>{if(received<=2048)upstream.end();});
  }else upstream.end();
 });
 return server;
}
