let worker = null, requestId = 0;
const pending = new Map();
function getWorker() {
  if (worker || !('Worker' in globalThis)) return worker;
  worker = new Worker(new URL('./zip-worker.js', import.meta.url), { type:'module' });
  worker.addEventListener('message', event => {
    const data=event.data||{}, request=pending.get(data.id);
    if(data.type==='progress') { try { request?.onProgress?.(data.percent,data.message); } catch(error) { request?.reject(error); worker?.terminate(); worker=null; pending.delete(data.id); } return; }
    if(!request) return;
    pending.delete(data.id);
    if(data.type==='failure') request.reject(new Error(data.message));
    else if(data.type==='opened') request.resolve({ ...data, archiveHandle:createArchiveHandle(worker,data.archive.archiveId) });
    else if(data.type==='extracted') request.resolve(data.blob);
  });
  worker.addEventListener('error', event => {
    const error=new Error(event.message||'The archive worker stopped unexpectedly.');
    for(const request of pending.values()) request.reject(error);
    pending.clear(); worker?.terminate(); worker=null;
  });
  return worker;
}
function request(type,payload={},onProgress=null) {
  const instance=getWorker(); if(!instance) return Promise.reject(new Error('Background processing is not supported in this browser.'));
  const id=++requestId;
  return new Promise((resolve,reject)=>{ pending.set(id,{resolve,reject,onProgress}); try { instance.postMessage({type,id,...payload}); } catch(error){pending.delete(id);reject(error);} });
}
function createArchiveHandle(instance,archiveId) {
  return {
    archiveId,
    extract(path) { return request('extract',{archiveId,path}); },
    dispose() { try { instance?.postMessage({type:'dispose',archiveId}); } catch {} }
  };
}
export function processZipInWorker(file,dateFormat,onProgress) { return request('open',{file,dateFormat},onProgress); }
export function cancelWorkerImport() {
  if(!worker) return;
  worker.terminate(); worker=null;
  for(const request of pending.values()) request.reject(new DOMException('Import cancelled.','AbortError'));
  pending.clear();
}
