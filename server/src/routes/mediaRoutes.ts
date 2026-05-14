import { getImages, getImageKitPool, uploadMedia, streamMedia, getLocalPool } from '../controllers/mediaController';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

router.get('/images', getImages);
router.get('/imagekit-pool', getImageKitPool);
router.get('/local-pool', getLocalPool);
router.post('/upload', upload.single('file'), uploadMedia);
router.get('/stream/:id', streamMedia);


export default router;
