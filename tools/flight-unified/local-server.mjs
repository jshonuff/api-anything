// Local-only HTTP server. No remote bind, database connection, cookies or persistence.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {executeSearch,validateSearch} from './local-search.mjs';
const assets=new Map([
 ['/dashboard/', ['dashboard/index.html','text/html; charset=utf-8']],
 ['/dashboard/index.html',['dashboard/index.html','text/html; charset=utf-8']],
 ['/dashboard/style.css',['dashboard/style.css','text/css; charset=utf-8']],
 ['/dashboard/app.mjs',['dashboard/app.mjs','text/javascript; charset=utf-8']],
 ['/dashboard/demo.mjs',['dashboard/demo.mjs','text/javascript; charset=utf-8']],
 ['/compare-ui.mjs',['compare-ui.mjs','text/javascript; charset=utf-8']]
]);
const secureHeaders={
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'"
};
function send(res,status,body,contentType='application/json; charset=utf-8'){
 res.writeHead(status,{...secureHeaders,'Content-Type':contentType});
 res.end(contentType.startsWith('application/json')?JSON.stringify(body):body);
}
async function readJson(req){
 let size=0,parts=[];
 for await(const chunk of req){
  size+=chunk.length;
  if(size>2048)throw Error('PAYLOAD_TOO_LARGE');
  parts.push(chunk);
 }
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export function createLocalServer({search=executeSearch,token=randomBytes(32).toString('hex')}={}){
 let busy=false;
 const server=http.createServer(async(req,res)=>{
  const port=server.address()?.port;
  const origin='http://127.0.0.1:'+port;
  if(!port||req.headers.host!=='127.0.0.1:'+port){
   return send(res,403,{error:'LOCAL_HOST_ONLY'});
  }
  const path=req.url?.split('?')[0]??'';
  if(req.method==='GET'&&path==='/'){
   res.writeHead(302,{...secureHeaders,Location:'/dashboard/'});return res.end();
  }
  if(req.method==='GET'&&path==='/api/session'){
   return send(res,200,{token,mode:'LOCAL_DEVELOPMENT',storage:'NONE'});
  }
  if(req.method==='GET'&&assets.has(path)){
   const [file,mime]=assets.get(path);
   try{
    const content=await readFile(new URL('./'+file,import.meta.url));
    return send(res,200,content,mime);
   }catch{return send(res,500,{error:'ASSET_NOT_FOUND'});}
  }
  if(req.method==='POST'&&path==='/api/search'){
   const candidate=req.headers['x-flight-local-token'];
   const ok=typeof candidate==='string'&&candidate.length===token.length&&
     timingSafeEqual(Buffer.from(candidate),Buffer.from(token));
   if(req.headers.origin!==origin||req.headers['content-type']?.split(';')[0]!=='application/json'||!ok){
    return send(res,403,{error:'LOCAL_AUTH_REQUIRED'});
   }
   if(busy)return send(res,429,{error:'SEARCH_ALREADY_RUNNING'});
   let body;
   try{body=validateSearch(await readJson(req));}
   catch(err){return send(res,400,{error:err?.message==='PAYLOAD_TOO_LARGE'?'PAYLOAD_TOO_LARGE':'INVALID_SEARCH'});}
   busy=true;
   try{
    const data=await search(body);
    return send(res,200,data);
   }catch{
    return send(res,502,{error:'SEARCH_UNAVAILABLE',message:'Provider lookup failed; this does not imply sold-out flights.'});
   }finally{busy=false;}
  }
  return send(res,404,{error:'NOT_FOUND'});
 });
 return server;
}
