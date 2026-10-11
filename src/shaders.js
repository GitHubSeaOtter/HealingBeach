const noise = /* glsl */`
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
float fbm(vec2 p) { return noise(p)*0.57+noise(p*2.03)*0.28+noise(p*4.01)*0.15; }
`;
const sky = /* glsl */`
uniform vec3 sunDirection;
uniform vec3 skyTop;
uniform vec3 skyHorizon;
uniform float day;
vec3 skyColor(vec3 d) {
  float elevation=max(d.y,0.0);
  vec3 c=mix(skyHorizon,skyTop,pow(elevation,0.55));
  float s=max(dot(d,sunDirection),0.0);
  c+=vec3(1.,0.73,0.40)*pow(s,12.)*0.14*day;
  c+=vec3(1.,0.87,0.62)*pow(s,650.)*0.7*day;
  c+=vec3(1.,0.95,0.80)*smoothstep(0.99955,0.9998,s)*2.0*day;
  return c;
}
`;
export const skyVertex = /* glsl */`
varying vec3 vDirection;
void main() { vDirection=position; gl_Position=projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
export const skyFragment = /* glsl */`
varying vec3 vDirection;
uniform float time;
${noise}
${sky}
void main() {
  vec3 d=normalize(vDirection);
  vec3 color=skyColor(d);
  if(d.y>0.03) {
    vec2 uv=d.xz/(d.y+0.3)*1.7 + vec2(time*0.002,0.);
    float cloud=smoothstep(0.56,0.82,fbm(uv))*smoothstep(0.02,0.22,d.y);
    color=mix(color,mix(vec3(0.08,0.11,0.17),vec3(0.98,0.97,0.91),day),cloud*0.65);
    vec2 stars=floor(d.xz/(d.y+0.2)*280.);
    float star=step(0.997,hash(stars))*pow(hash(stars+10.),6.);
    color+=star*(1.-day)*smoothstep(0.03,0.3,d.y)*1.8;
    float moon=dot(d,normalize(vec3(-0.35,0.52,-0.7)));
    color+=vec3(0.70,0.81,1.0)*smoothstep(0.99945,0.9997,moon)*(1.-day);
  }
  gl_FragColor=vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
const wave = /* glsl */`
float wave(vec2 p) {
 return sin(p.x*0.35+p.y*0.8-time*0.9)*0.045
      +sin(p.y*1.5-time*1.35+p.x*0.19)*0.036
      +sin(p.x*2.6+p.y*2.2-time*1.8)*0.018
      +sin(p.y*0.24-time*0.55)*0.065;
}
`;
export const oceanVertex = /* glsl */`
uniform float time;
varying vec3 vWorld;
${wave}
void main() {
  vec3 p=position;
  vec4 world=modelMatrix*vec4(p,1.);
  world.y+=wave(world.xz);
  vWorld=world.xyz;
  gl_Position=projectionMatrix*viewMatrix*world;
}
`;
export const oceanFragment = /* glsl */`
uniform float time;
varying vec3 vWorld;
${noise}
${wave}
${sky}
void main() {
  vec2 p=vWorld.xz;
  float coast=1.8+0.6*sin(p.x*0.09)+0.35*cos(p.x*0.23);
  float depth=(coast-p.y)*0.17;
  if(depth< -0.018) discard;
  float eps=0.09;
  float detail=1.-smoothstep(18.,110.,length(cameraPosition-vWorld));
  vec2 ripple=vec2(noise(p*4.+time*0.3)-0.5,noise(p*4.-time*0.2+14.)-0.5)*0.055*detail;
  vec3 n=normalize(vec3((wave(p-vec2(eps,0.))-wave(p+vec2(eps,0.)))/(2.*eps)+ripple.x,1.,(wave(p-vec2(0.,eps))-wave(p+vec2(0.,eps)))/(2.*eps)+ripple.y));
  vec3 v=normalize(cameraPosition-vWorld);
  float fresnel=0.035+0.965*pow(1.-max(dot(n,v),0.0),5.);
  vec3 reflected=reflect(-v,n);
  vec3 sea=mix(vec3(0.11,0.72,0.64),vec3(0.018,0.32,0.42),smoothstep(0.1,5.,depth));
  sea=mix(vec3(0.80,0.77,0.57),sea,smoothstep(0.,0.7,depth));
  float caustic=pow(1.-abs(sin(p.x*3.+sin(p.y*2.1+time*0.5))*sin(p.y*3.8+sin(p.x*2.6-time*0.6))),12.);
  sea+=caustic*vec3(0.18,0.23,0.13)*exp(-depth*0.9)*day*detail;
  sea*=mix(0.13,1.0,day);
  vec3 color=mix(sea,skyColor(reflected),clamp(fresnel,0.,0.85));
  float shine=pow(max(dot(reflect(-sunDirection,n),v),0.),190.);
  color+=vec3(1.,0.82,0.52)*shine*1.3*day;
  float wash=sin(depth*9.-time*1.25+sin(p.x*0.7)*0.35);
  float foam=pow(max(wash,0.),10.)*(1.-smoothstep(0.08,1.3,depth));
  foam+= (1.-smoothstep(0.,0.12,abs(depth-0.03-sin(time*0.7)*0.035)))*0.55;
  foam*=0.55+0.45*noise(p*8.+time*0.2);
  color=mix(color,vec3(0.93,0.97,0.88)*mix(0.3,1.,day),clamp(foam,0.,0.85));
  float fog=1.-exp(-length(cameraPosition-vWorld)*0.0025);
  color=mix(color,skyHorizon,fog);
  gl_FragColor=vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
