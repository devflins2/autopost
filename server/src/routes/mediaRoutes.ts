import { Router } from 'express';
import { getImages, uploadMedia, streamMedia, getLocalPool } from '../controllers/mediaController';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

router.get('/images', getImages);
router.get('/local-pool', getLocalPool);
router.post('/upload', upload.single('file'), uploadMedia);
router.get('/stream/:id', streamMedia);


export default router;
