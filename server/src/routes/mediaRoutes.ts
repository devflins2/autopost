import { Router } from 'express';
import { getImages, getImageKitPool } from '../controllers/mediaController';


const router = Router();

router.get('/images', getImages);
router.get('/imagekit-pool', getImageKitPool);


export default router;
