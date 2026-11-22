const fs=require('fs');const P='../planches/';
const net=f=>{let s=fs.readFileSync(P+f,'utf8');s=s.slice(s.indexOf('<svg'));s=s.replace(/<!--[\s\S]*?-->/g,'').replace(/<metadata[\s\S]*?<\/metadata>/g,'').replace(/\s+/g,' ');return JSON.stringify(s).replace(/<\/script/gi,'<\\/script');};
let h=fs.readFileSync('demo-tete.part','utf8')+fs.readFileSync('demo-corps.part','utf8')+fs.readFileSync('demo-corps-script.part','utf8');
h=h.replace('/*SVG_FACE*/',()=>net('servier-muscles-face.svg')).replace('/*SVG_DOS*/',()=>net('servier-muscles-dos.svg'));
const b64=(f,t)=>JSON.stringify('data:'+t+';base64,'+fs.readFileSync('../lynch/'+f).toString('base64'));
h=h.replace('/*IMG_PROFIL*/',()=>b64('lynch-profil.jpg','image/jpeg')).replace('/*IMG_FACE*/',()=>b64('lynch-face.jpg','image/jpeg')).replace('/*IMG_BRAS*/',()=>b64('sobotta-bras.jpg','image/jpeg'));
fs.writeFileSync('demo-carte.html',h);console.log(h.length);
