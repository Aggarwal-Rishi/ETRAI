// Shared confidence calculation. Duplicate copies cannot change the result.
function calculateEvidenceConfidence(sources=[]) {
 const decisive=sources.filter(s=>['SUPPORTS','REFUTES'].includes(s.stance||s.relationship) && !s.isSyndicatedDuplicate && s.isIndependent!==false);
 const known=decisive.filter(s=>s.authorityKnown!==false && s.sourceType!=='SOCIAL_MEDIA');
 const origin=s=>s.independenceGroup||s.syndicationGroup||s.domain||s.url;
 const origins=new Set(known.map(origin).filter(Boolean));
 const support=new Set(decisive.filter(s=>(s.stance||s.relationship)==='SUPPORTS').map(origin).filter(Boolean));
 const refute=new Set(decisive.filter(s=>(s.stance||s.relationship)==='REFUTES').map(origin).filter(Boolean));
 const authority=known.map(s=>s.authorityScore).filter(Number.isFinite);
 const evidenceQuality=authority.length?Math.max(...authority):0;
 const sourceAgreement=support.size+refute.size?Math.round(100*Math.max(support.size,refute.size)/(support.size+refute.size)):0;
 const sourceIndependence=origins.size?Math.min(100,60+20*(origins.size-1)):0;
 const confidence=decisive.length?Math.round(evidenceQuality*.4+sourceAgreement*.3+sourceIndependence*.3):30;
 return {evidenceQuality,sourceAgreement,sourceIndependence,confidence};
}
module.exports={calculateEvidenceConfidence};
