import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default function App() {
  const [token, setToken] = useState(null);
  const [modelUrl, setModelUrl] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [search, setSearch] = useState({ type: '', pressure: 0 });
  const [annotations, setAnnotations] = useState([]);
  const containerRef = useRef();
  const rendererRef = useRef();
  const sceneRef = useRef(new THREE.Scene());
  const cameraRef = useRef();
  const controlsRef = useRef();
  const modelRef = useRef();

  // Initialize three.js
  useEffect(() => {
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const scene = sceneRef.current;
    const camera = new THREE.PerspectiveCamera(60, width/height, 0.1, 1000);
    camera.position.set(0,2,5);
    cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    containerRef.current.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    scene.add(new THREE.AmbientLight(0xffffff,1));
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    rendererRef.current = renderer;
    animate();
    return () => renderer.dispose();
  }, []);

  // Load model
  useEffect(() => {
    if (!modelUrl) return;
    const loader = new GLTFLoader();
    loader.load(modelUrl, gltf => {
      const scene = sceneRef.current;
      if (modelRef.current) scene.remove(modelRef.current);
      modelRef.current = gltf.scene;
      scene.add(gltf.scene);
    });
  }, [modelUrl]);

  // Handle clicks for metadata and annotations
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    function onClick(event) {
      pointer.x = (event.offsetX / renderer.domElement.clientWidth) * 2 - 1;
      pointer.y = -(event.offsetY / renderer.domElement.clientHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, cameraRef.current);
      const intersects = raycaster.intersectObjects(modelRef.current ? modelRef.current.children : [] , true);
      if (intersects.length > 0) {
        const id = intersects[0].object.name;
        fetch(`/api/metadata/${id}`, { headers: { Authorization: `Bearer ${token}` }})
          .then(r => r.json()).then(setMetadata);
      }
    }
    function onDblClick(event){
      pointer.x = (event.offsetX / renderer.domElement.clientWidth) * 2 - 1;
      pointer.y = -(event.offsetY / renderer.domElement.clientHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, cameraRef.current);
      const plane = new THREE.Plane(new THREE.Vector3(0,1,0),0);
      const pos = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane,pos);
      const note = prompt('Annotation note');
      if (note) {
        fetch('/api/annotations', {
          method:'POST',
          headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
          body: JSON.stringify({ x: pos.x, y: pos.y, z: pos.z, note })
        }).then(r=>r.json()).then(a=>setAnnotations([...annotations,a]));
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({color:'red'}));
        sphere.position.copy(pos);
        sceneRef.current.add(sphere);
      }
    }
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('dblclick', onDblClick);
    return () => {
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('dblclick', onDblClick);
    };
  }, [token, annotations]);

  const handleLogin = async e => {
    e.preventDefault();
    const form = e.target;
    const res = await fetch('/api/login', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username: form.username.value, password: form.password.value })
    });
    const data = await res.json();
    setToken(data.token);
  };

  const handleUpload = async e => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('model', e.target.files[0]);
    const res = await fetch('/api/upload', { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body: formData });
    const data = await res.json();
    setModelUrl(data.url);
  };

  const runSearch = async e => {
    e.preventDefault();
    const res = await fetch(`/api/search?type=${search.type}&pressureMin=${search.pressure}`, { headers:{ Authorization:`Bearer ${token}` }});
    const data = await res.json();
    // highlight
    const scene = modelRef.current;
    if (scene) scene.traverse(obj => {
      if (data.includes(obj.name)) obj.material = new THREE.MeshBasicMaterial({ color: 'yellow' });
    });
  };

  return (
    <div style={{display:'flex',height:'100vh'}}>
      <div style={{flex:1}} ref={containerRef}></div>
      <div style={{width:'300px',padding:'10px',background:'#eee',overflow:'auto'}}>
        {!token && (
          <form onSubmit={handleLogin}>
            <h3>Login</h3>
            <input name="username" placeholder="user" />
            <input name="password" type="password" placeholder="pass" />
            <button type="submit">Login</button>
          </form>
        )}
        {token && (
          <>
            <h3>Upload Model</h3>
            <input type="file" onChange={handleUpload} />
            <h3>Search</h3>
            <form onSubmit={runSearch}>
              <input placeholder="type" value={search.type} onChange={e=>setSearch({...search,type:e.target.value})} />
              <input type="number" placeholder="pressure" value={search.pressure} onChange={e=>setSearch({...search,pressure:e.target.value})} />
              <button type="submit">Run</button>
            </form>
            <h3>Metadata</h3>
            <pre>{metadata ? JSON.stringify(metadata,null,2) : 'click an object'}</pre>
          </>
        )}
      </div>
    </div>
  );
}
