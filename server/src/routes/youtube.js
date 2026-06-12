import ytSearch from "yt-search";

const cache = new Map();
const TTL_MS = 5 * 60 * 1000;

function cachedSearch(query) {
  const hit = cache.get(query);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.data);
  return ytSearch(query).then((res) => {
    const data = (res.videos ?? []).slice(0, 25).map((v) => ({
      source: "youtube",
      externalId: v.videoId,
      title: v.title,
      artist: v.author?.name ?? "",
      durationS: v.seconds ?? null,
      thumbnail: v.thumbnail,
      url: v.url,
    }));
    cache.set(query, { at: Date.now(), data });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return data;
  });
}

export function registerYoutubeRoutes(app) {
  app.get(
    "/api/youtube/search",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const q = (req.query?.q ?? "").toString().trim();
      if (!q) return reply.code(400).send({ error: "missing_query" });
      try {
        const results = await cachedSearch(q);
        return { query: q, results };
      } catch (err) {
        app.log.error({ err }, "youtube search failed");
        return reply.code(502).send({ error: "search_failed" });
      }
    },
  );

  app.get(
    "/api/youtube/video/:id",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const id = req.params.id;
      if (!/^[\w-]{6,20}$/.test(id))
        return reply.code(400).send({ error: "bad_id" });
      try {
        const v = await ytSearch({ videoId: id });
        return {
          source: "youtube",
          externalId: v.videoId,
          title: v.title,
          artist: v.author?.name ?? "",
          durationS: v.seconds ?? null,
          thumbnail: v.thumbnail,
          url: v.url,
          description: v.description ?? "",
        };
      } catch (err) {
        return reply.code(404).send({ error: "not_found" });
      }
    },
  );
}
