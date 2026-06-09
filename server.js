import express from "express";

const app = express();
app.use(express.static("public"));

app.get("/api/random", async (req, res) => {
	try {
		const response = await fetch(
			"https://api.bilibili.com/x/v2/history/toview",
			{
				headers: {
					Cookie: req.headers["x-bili-cookie"],
					"User-Agent": "Mozilla/5.0",
					Referer: "https://www.bilibili.com",
				},
			},
		);

		const data = await response.json();

		if (data.code !== 0) {
			return res.status(400).json({ error: data.message });
		}

		const list = data.data.list;
		if (list.length === 0) {
			return res
				.status(404)
				.json({ error: "No videos found in watch later list" });
		}
		const shuffled = list
			.map((v) => ({ value: v, sort: Math.random() }))
			.sort((a, b) => a.sort - b.sort)
			.map((v) => ({
				title: v.value.title,
				bvid: v.value.bvid,
				cover: v.value.pic,
				author: v.value.owner.name,
				duration: v.value.duration,
				url: `https://www.bilibili.com/video/${v.value.bvid}`,
			}));
		res.json(shuffled);
	} catch (err) {
		res.status(500).json({ error: "Server Error" });
	}
});
app.get("/api/cover", async (req, res) => {
	const url = req.query.url;
	if (!url) return res.status(400).json({ error: "missing url" });

	const response = await fetch(url, {
		headers: {
			Referer: "https://www.bilibili.com",
			"User-Agent": "Mozilla/5.0",
		},
	});

	res.setHeader(
		"Content-Type",
		response.headers.get("content-type") || "image/jpeg",
	);
	const buffer = await response.arrayBuffer();
	res.send(Buffer.from(buffer));
});

app.listen(3000, () => {
	console.log("running on http://localhost:3000");
});
