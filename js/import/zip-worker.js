import '../../vendor/jszip.min.js';
import { decodeTextBytes, findAmbiguousDates, parseWhatsAppText } from './whatsapp-parser.js';
import { basename, matchMedia } from './media-matcher.js';

const MAX_ENTRIES = 6000, MAX_ARCHIVE_SIZE = 500 * 1024 * 1024, MAX_TOTAL_UNCOMPRESSED = 750 * 1024 * 1024, MAX_SINGLE_FILE = 250 * 1024 * 1024, MAX_RATIO = 250;
let activeZip = null, activeId = null;
function unsafePath(path) { const n = String(path).replace(/\\/g, '/'); return n.startsWith('/') || /^[a-z]:/i.test(n) || n.split('/').some(part => part === '..' || part === '.'); }
function textScore(path,size) { const name=basename(path).toLowerCase(); return Math.min(size/1000,200)+(/^(whatsapp )?chat\.txt$/.test(name)?1000:0)+(/chat|conversation|message|whatsapp/.test(name)?250:0)+(path.includes('/')?8:0); }
async function openArchive(data) {
  const { id, file, dateFormat } = data;
  if (!self.JSZip) throw new Error('The local ZIP engine could not be loaded.');
  if (Number(file.size || 0) > MAX_ARCHIVE_SIZE) throw new Error('The ZIP file exceeds the 500 MB import limit.');
  self.postMessage({ type:'progress', id, percent:4, message:'Validating ZIP archive…' });
  let zip;
  try { zip = await self.JSZip.loadAsync(file, { checkCRC32:false, createFolders:false }); }
  catch (error) { throw new Error(`This ZIP could not be opened. It may be encrypted, incomplete or invalid. ${error.message || ''}`.trim()); }
  const names=Object.keys(zip.files);
  if (!names.length) throw new Error('The selected ZIP archive is empty.');
  if (names.length>MAX_ENTRIES) throw new Error(`This archive contains more than ${MAX_ENTRIES.toLocaleString()} entries.`);
  const entries=[], textFiles=[]; let total=0, scanned=0;
  for (const path of names) {
    const item=zip.files[path]; if(item.dir) continue;
    const original=item.unsafeOriginalName||path;
    if(unsafePath(path)||unsafePath(original)) throw new Error(`Unsafe archive path detected: ${original}`);
    if(path.startsWith('__MACOSX/')||basename(path)==='.DS_Store') continue;
    const size=Number(item._data?.uncompressedSize||0), compressed=Number(item._data?.compressedSize||0);
    if(size>MAX_SINGLE_FILE) throw new Error('A file exceeds the 250 MB per-file safety limit.');
    total+=size; if(total>MAX_TOTAL_UNCOMPRESSED) throw new Error('The expanded archive exceeds the 750 MB safety limit.');
    if(size>1024*1024&&(compressed===0||size/compressed>MAX_RATIO)) throw new Error(`A suspicious compression ratio was detected for ${basename(path)}.`);
    const entry={path,size,compressedSize:compressed}; entries.push(entry); if(/\.txt$/i.test(path)) textFiles.push({ ...entry, zipObject:item });
    scanned++; if(scanned%100===0) self.postMessage({type:'progress',id,percent:5+Math.round(scanned/names.length*18),message:`Inspecting archive · ${scanned.toLocaleString()} files`});
  }
  if(!textFiles.length) throw new Error('No .txt conversation file was found inside this ZIP. Include the text transcript in your WhatsApp export.');
  textFiles.sort((a,b)=>textScore(b.path,b.size)-textScore(a.path,a.size));
  const transcriptFile=textFiles[0]; self.postMessage({type:'progress',id,percent:28,message:`Reading ${basename(transcriptFile.path)}…`});
  const transcript=decodeTextBytes(await transcriptFile.zipObject.async('uint8array'));
  if(!transcript.trim()) throw new Error('The conversation transcript is empty.');
  self.postMessage({type:'progress',id,percent:38,message:'Reconstructing messages…'});
  const ambiguousDates=findAmbiguousDates(transcript), parsed=parseWhatsAppText(transcript,{dateFormat});
  if(!parsed.messages.length) throw new Error('No supported WhatsApp message timestamps were detected. Check the export date format.');
  self.postMessage({type:'progress',id,percent:68,message:`Parsed ${parsed.messages.length.toLocaleString()} messages`});
  const mediaEntries=entries.filter(entry=>entry.path!==transcriptFile.path);
  const matching=matchMedia(parsed.messages,mediaEntries);
  const archiveId=`archive-${id}`; activeZip=zip; activeId=archiveId;
  const media=matching.media;
  self.postMessage({type:'opened',id,archive:{archiveId,transcriptPath:transcriptFile.path,transcriptName:basename(transcriptFile.path),expandedSize:total,entries,candidateTextFiles:textFiles.map(x=>x.path)},parsed:{messages:parsed.messages,participants:parsed.participants,invalidHeaders:parsed.invalidHeaders},matching:{media,missing:matching.missing,ambiguous:matching.ambiguous},ambiguousDates});
}
self.addEventListener('message', async event=>{
  const data=event.data||{};
  try {
    if(data.type==='open') await openArchive(data);
    else if(data.type==='extract') {
      if(data.archiveId!==activeId||!activeZip) throw new Error('This archive is no longer open.');
      const entry=activeZip.file(data.path); if(!entry) throw new Error('This attachment is not available in the current archive.');
      const blob=await entry.async('blob'); self.postMessage({type:'extracted',id:data.id,blob});
    } else if(data.type==='dispose'&&data.archiveId===activeId) { activeZip=null; activeId=null; }
  } catch(error) { self.postMessage({type:'failure',id:data.id,message:error.message||'Could not process this ZIP.'}); }
});
