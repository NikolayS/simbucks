export class Vector3 {
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
  clone(){return new Vector3(this.x,this.y,this.z);}
  length(){return Math.hypot(this.x,this.y,this.z);}
  addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
  distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
}
export class Euler { constructor(){this.x=0;this.y=0;this.z=0;} set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} }
export class Object3D {
  constructor(){this.children=[];this.parent=null;this.position=new Vector3();this.rotation=new Euler();this.visible=true;this.userData={};this.name='';}
  add(...o){for(const c of o){if(c.parent)c.parent.remove(c);c.parent=this;this.children.push(c);}return this;}
  remove(...o){for(const c of o){const i=this.children.indexOf(c);if(i>=0){this.children.splice(i,1);c.parent=null;}}return this;}
  traverse(fn){fn(this);for(const c of this.children)c.traverse(fn);}
}
export class Group extends Object3D {}
export class Mesh extends Object3D { constructor(g,m){super();this.geometry=g;this.material=m;this.castShadow=false;this.receiveShadow=false;} }
export class CapsuleGeometry { dispose(){} }
export class SphereGeometry { dispose(){} }
export class MeshStandardMaterial { constructor(o={}){Object.assign(this,o);} dispose(){} }
export class Box3 { setFromObject(){return this;} }
