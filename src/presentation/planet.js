import * as THREE from '../../assets/vendor/three.module.js';

// Stylized gas giant, authored for this scene (not a scale model of Saturn).
// Bands and ring grooves are procedural: no external texture downloads.
export function createPlanet() {
  const planet = new THREE.Group();
  planet.position.set(1250, 800, -1650);
  planet.rotation.set(.85, .12, -.32);
  const light = new THREE.Vector3(-.85, .3, .32).normalize();
  const vertexShader = `
    varying vec3 localPosition;
    varying vec3 localNormal;
    varying vec3 viewNormal;
    varying vec3 viewDirection;
    void main() {
      localPosition = position;
      localNormal = normal;
      vec4 p = modelViewMatrix * vec4(position, 1.0);
      viewNormal = normalize(normalMatrix * normal);
      viewDirection = normalize(-p.xyz);
      gl_Position = projectionMatrix * p;
    }
  `;
  const surface = new THREE.Mesh(new THREE.SphereGeometry(170, 96, 64), new THREE.ShaderMaterial({
    uniforms: { lightDirection: { value: light } },
    vertexShader,
    fragmentShader: `
      uniform vec3 lightDirection;
      varying vec3 localPosition;
      varying vec3 localNormal;
      varying vec3 viewNormal;
      varying vec3 viewDirection;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      void main() {
        vec3 p = normalize(localPosition);
        float turbulence = noise(p*9.0)*.65 + noise(p*24.0)*.25 + noise(p*58.0)*.1;
        float latitude = p.y + (turbulence-.5)*.085;
        float wide = .5+.5*sin(latitude*18.0 + 2.0*sin(latitude*5.0) + turbulence*1.4);
        float fine = .5+.5*sin(latitude*125.0 + turbulence*3.0);
        vec3 color = mix(vec3(.19,.025,.02), vec3(.61,.12,.075), wide);
        color = mix(color, vec3(.8,.34,.18), smoothstep(.64,.96,wide)*.55);
        color *= .9 + fine*.13;
        float diffuse = max(0.0, dot(normalize(localNormal),lightDirection));
        color *= .09 + .94*pow(diffuse,.7);
        float rim = pow(1.0-max(0.0,dot(normalize(viewNormal),normalize(viewDirection))),4.5);
        color += vec3(.5,.12,.055)*rim*(.15+diffuse*.6);
        gl_FragColor = vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  }));
  planet.add(surface);
  const ringGeometry = new THREE.RingGeometry(205, 315, 192, 1);
  ringGeometry.rotateX(-Math.PI / 2);
  const rings = new THREE.Mesh(ringGeometry, new THREE.ShaderMaterial({
    uniforms: { lightDirection: { value: light } },
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
    vertexShader,
    fragmentShader: `
      uniform vec3 lightDirection;
      varying vec3 localPosition;
      void main() {
        float radius = length(localPosition.xz);
        float r = (radius-205.0)/110.0;
        float detail = 1.0-smoothstep(.5,3.0,fwidth(radius)*1.2);
        float grooves = .5+.5*sin(radius*1.2 + sin(radius*.22)*2.0)*detail;
        float fine = .5+.5*sin(radius*3.1)*(1.0-smoothstep(.5,3.0,fwidth(radius)*3.1));
        float gap = smoothstep(268.0,270.0,radius)*(1.0-smoothstep(278.0,280.0,radius));
        float edge = smoothstep(0.0,.04,r)*(1.0-smoothstep(.92,1.0,r));
        float opacity = (.56 + .22*grooves + .08*fine)*edge*(1.0-gap*.94);
        vec3 color = mix(vec3(.23,.14,.12),vec3(.58,.38,.28),grooves*.6+.3);
        // Analytic planet shadow on the rings, in the planet's local coordinates.
        float along = dot(localPosition,lightDirection);
        float closest = length(localPosition-lightDirection*along);
        float shadow = (1.0-smoothstep(160.0,178.0,closest))*(1.0-step(0.0,along));
        color *= mix(.66,.1,shadow) * (.8 + .2*sin(radius*.25)*sin(radius*.25));
        gl_FragColor = vec4(color,opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  }));
  planet.add(rings);
  return planet;
}
