import { NextApiRequest, NextApiResponse } from 'next';

import { getAllBurnsFromSender } from '@/lib/burn';

const findAll = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') return res.status(405).end();

  const { sender } = req.query;

  if (typeof sender !== 'string' || !sender) return res.status(400).end();

  try {
    const burns = await getAllBurnsFromSender(sender);

    if (!burns) return res.status(204).end();

    return res.status(200).json(burns);
  } catch (error) {
    console.error('Error finding burns:', error);
    return res.status(500).end();
  }
};

export default findAll;
