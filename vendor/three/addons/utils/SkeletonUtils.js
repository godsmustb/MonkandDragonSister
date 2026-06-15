// Minimal SkeletonUtils (Three.js r160) — only the `clone()` helper, which deep-clones
// a hierarchy and rebinds any SkinnedMesh to the cloned skeleton/bones. Vendored so the
// game can make independent per-instance copies of a rigged GLB (each demon/boss poses
// its own skeleton). No external deps — operates purely on Object3D clone APIs.

function clone(source) {
  const sourceLookup = new Map();
  const cloneLookup = new Map();
  const cloneRoot = source.clone();

  parallelTraverse(source, cloneRoot, (sourceNode, clonedNode) => {
    sourceLookup.set(clonedNode, sourceNode);
    cloneLookup.set(sourceNode, clonedNode);
  });

  cloneRoot.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    const clonedMesh = node;
    const sourceMesh = sourceLookup.get(node);
    const sourceBones = sourceMesh.skeleton.bones;

    clonedMesh.skeleton = sourceMesh.skeleton.clone();
    clonedMesh.bindMatrix.copy(sourceMesh.bindMatrix);

    clonedMesh.skeleton.bones = sourceBones.map((bone) => cloneLookup.get(bone));

    clonedMesh.bind(clonedMesh.skeleton, clonedMesh.bindMatrix);
  });

  return cloneRoot;
}

function parallelTraverse(a, b, callback) {
  callback(a, b);
  for (let i = 0; i < a.children.length; i++) {
    parallelTraverse(a.children[i], b.children[i], callback);
  }
}

export { clone };
