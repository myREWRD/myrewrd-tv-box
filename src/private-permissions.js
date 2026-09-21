// One owner per Electron session prevents late private-window cleanup from
// removing a newer window's policy. During private sign-in, unrelated pages
// retain only playback permissions; no camera, microphone, location or desktop
// capture is silently granted. After the last private window closes, restore
// the application's existing default policy.
const owners=new WeakMap();
function denyPrivatePermissions(contents,onDenied=()=>{}) {
  const profile=contents.session;
  let state=owners.get(profile);
  if(!state){
    state={windows:new Map([[contents,onDenied]])};owners.set(profile,state);
    const allowed=(wc,permission)=>{
      if(!wc||state.windows.has(wc))return false;
      return ['fullscreen','mediaKeySystem','screen-wake-lock'].includes(permission);
    };
    profile.setPermissionCheckHandler(allowed);
    profile.setPermissionRequestHandler((wc,permission,callback)=>{state.windows.get(wc)?.();callback(allowed(wc,permission));});
  }
  state.windows.set(contents,onDenied);
  let released=false;
  return ()=>{
    if(released)return;released=true;state.windows.delete(contents);
    if(!state.windows.size&&owners.get(profile)===state){owners.delete(profile);profile.setPermissionRequestHandler(null);profile.setPermissionCheckHandler(null);}
  };
}
module.exports={denyPrivatePermissions};
