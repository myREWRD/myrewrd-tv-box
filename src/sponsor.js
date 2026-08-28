function normalizeSponsorPayload(sponsor) {
  if (!sponsor || typeof sponsor !== "object") return null;
  return {
    ...sponsor,
    logoUrl: sponsor.logoUrl || sponsor.logo_url || null,
    logoUrlMedium: sponsor.logoUrlMedium || sponsor.logo_url_medium || null,
    logoUrlCompact: sponsor.logoUrlCompact || sponsor.logo_url_compact || null,
  };
}

function sponsorLogoCandidates(sponsor) {
  if (!sponsor || typeof sponsor !== "object") return [];
  return [sponsor.logoUrlCompact, sponsor.logoUrlMedium, sponsor.logoUrl]
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
}

module.exports = { normalizeSponsorPayload, sponsorLogoCandidates };
