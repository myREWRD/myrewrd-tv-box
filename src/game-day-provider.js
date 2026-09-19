const HOMES = Object.freeze({youtube:'https://tv.youtube.com/',hulu:'https://www.hulu.com/',peacock:'https://www.peacocktv.com/',espn:'https://www.espn.com/watch/'});
function providerId(value) { return Object.hasOwn(HOMES,value) ? value : null; }
// Only allowlisted playback routes are retained in the local paired-device config. Never retain sign-in redirects,
// arbitrary navigation, query tokens, account paths, or provider cookies here.
function resumeUrl(provider,value) {
  try {
    const u=new URL(value), home=new URL(HOMES[provider]);
    if(u.origin!==home.origin || u.username || u.password || u.port || u.pathname.length>1024) return null;
    const routes={youtube:/^\/watch\/[a-zA-Z0-9_-]+\/?$/,hulu:/^\/(?:watch\/[a-zA-Z0-9_-]+|live-tv|live)\/?$/,peacock:/^\/watch\/playback\/(?:live|vod)\/[a-zA-Z0-9_/-]+$/,espn:/^\/watch\/player\/_\/id\/[a-zA-Z0-9_-]+(?:\/startOption\/live)?\/?$/};
    if(!routes[provider]?.test(u.pathname)) return null;
    return u.origin+u.pathname;
  } catch {return null;}
}
function createGameDayProvider({getConfig,save}) {
  let remembered=Object.create(null);
  const stored=getConfig().gameDayResumeUrls;
  if(stored && typeof stored==='object' && !Array.isArray(stored)) {
    for(const id of Object.keys(HOMES)){const target=resumeUrl(id,stored[id]);if(target)remembered[id]=target;}
  }
  return {
    reset(){remembered=Object.create(null);},
    selected(){return providerId(getConfig().gameDayProvider)||'youtube';},
    choose(id){if(!providerId(id))return null;save({gameDayProvider:id});return this.target();},
    capture(url){
      const id=this.selected(),target=resumeUrl(id,url);
      if(target && remembered[id]!==target){remembered[id]=target;save({gameDayResumeUrls:{...remembered}});}
    },
    hasResume(){return Boolean(remembered[this.selected()]);},
    target(){return remembered[this.selected()]||HOMES[this.selected()];},
  };
}
module.exports={HOMES,providerId,resumeUrl,createGameDayProvider};
