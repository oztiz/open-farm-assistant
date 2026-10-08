// Compile the two MCP modules to /tmp/ofa-agshare-compiled before running.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { uploadPayload, revision } = require('/tmp/ofa-agshare-compiled/client.js');
const { POST } = require('/tmp/ofa-agshare-compiled/route.js');
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const point = { latitude: 59, longitude: 11 };
const field = { id, name: 'Fixture', latitude: 59, longitude: 11, isPublic: false, boundaries: [[point, {...point, longitude: 11.001}, {...point, latitude: 59.001}]], abLines: [{name:'AB', type:'AB', coords:[point,{...point,latitude:59.001}]}], updatedAt:'2026-10-08T00:00:00Z' };
process.env.AGSHARE_BRIDGE_TOKEN = 'test-only';
process.env.AGSHARE_API_KEY = 'fixture-only';
let calls=[];
function mockedFetch() { calls=[]; global.fetch=async (url, options) => { calls.push({url,options}); return Response.json(url.endsWith('/api/fields') ? [{id}] : field); }; }
async function call(name,args,token='test-only') { const req=new Request('http://localhost/api/agshare/mcp',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});return await POST(req); }
test('partial update preserves boundary, AB lines and privacy',()=>{const p=uploadPayload({name:'Renamed'},field); assert.deepEqual(p.abLines,field.abLines);assert.deepEqual(p.boundary.outer,field.boundaries[0]);assert.equal(p.isPublic,false);});
test('invalid coordinates rejected before a write',()=>assert.throws(()=>uploadPayload({origin:{latitude:91,longitude:0}},field)));
test('unauthenticated calls never contact AgShare',async()=>{mockedFetch();const r=await call('agshare_list_fields',{},'wrong');assert.equal(r.status,401);assert.equal(calls.length,0);});
test('stale revision blocks update',async()=>{mockedFetch();const r=await (await call('agshare_update_field',{field_id:id,expected_name:field.name,expected_revision:'stale',name:'Renamed'})).json();assert.equal(r.error.code,-32602);assert.ok(calls.every(c=>c.options.method==='GET'));});
test('wrong field name blocks update',async()=>{mockedFetch();const r=await (await call('agshare_update_field',{field_id:id,expected_name:'Wrong',expected_revision:revision(field)})).json();assert.equal(r.error.code,-32602);assert.ok(calls.every(c=>c.options.method==='GET'));});
test('unowned field cannot be modified',async()=>{mockedFetch();const r=await (await call('agshare_update_field',{field_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',expected_name:field.name,expected_revision:revision(field),name:'Renamed'})).json();assert.equal(r.result.isError,true);assert.ok(calls.every(c=>c.options.method==='GET'));});
test('PUT transmits complete preserved payload and reads back',async()=>{mockedFetch();const r=await (await call('agshare_update_field',{field_id:id,expected_name:field.name,expected_revision:revision(field),name:'Renamed'})).json();assert.ok(r.result.structuredContent.updated);const put=calls.find(c=>c.options.method==='PUT');const p=JSON.parse(put.options.body);assert.equal(p.name,'Renamed');assert.deepEqual(p.abLines,field.abLines);assert.deepEqual(p.boundary.outer,field.boundaries[0]);assert.equal(calls.at(-1).options.method,'GET');});

test('whole-field deletion is unavailable',async()=>{mockedFetch();const r=await (await call('agshare_delete_field',{field_id:id})).json();assert.equal(r.error.code,-32602);assert.equal(calls.length,0);});
