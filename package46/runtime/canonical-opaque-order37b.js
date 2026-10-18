// Extracted unchanged comparator from public CI commit e057f1598f7f3dd19037e91ca5aca3221bfdcef9.
// Tested on the generic Einar head fixture; transparent sorting is untouched.
export function enableCanonicalOpaqueOrder(renderer){
 const cmp=(a,b)=>a<b?-1:a>b?1:0;
 renderer.setOpaqueSort((a,b)=>a.groupOrder-b.groupOrder||a.renderOrder-b.renderOrder||cmp(a.material.name,b.material.name)||a.z-b.z||cmp(a.object.name,b.object.name));
 return 'groupOrder,renderOrder,source material name,z,source mesh name';
}
