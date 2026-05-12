const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const controller = require("./support-tickets.controller");
const AuthHelper = require("../auth/auth.helper");

const messagesDir = path.join(
	__dirname,
	"../../../../uploads/support-ticket-messages",
);
if (!fs.existsSync(messagesDir)) {
	fs.mkdirSync(messagesDir, { recursive: true });
}

const messageStorage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, messagesDir);
	},
	filename: (req, file, cb) => {
		const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
		cb(null, `support-message-${uniqueSuffix}${path.extname(file.originalname)}`);
	},
});

const messageUpload = multer({
	storage: messageStorage,
	limits: {
		files: 6,
	},
});

router.get("/", AuthHelper.authenticate, controller.list);
router.get("/:id", AuthHelper.authenticate, controller.info);
router.get("/:id/messages", AuthHelper.authenticate, controller.listMessages);
router.post(
	"/:id/messages",
	AuthHelper.authenticate,
	messageUpload.array("attachments", 6),
	controller.createMessage,
);
router.put("/:id", AuthHelper.authenticate, controller.update);

module.exports = router;
