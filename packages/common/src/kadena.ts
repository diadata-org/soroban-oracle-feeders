import type { IClient, ICommandResult } from '@kadena/client';
import { isSignedTransaction } from '@kadena/client';
import type { ICommand, IUnsignedCommand } from '@kadena/types';

export const submitKadenaTx = async (
  client: IClient,
  tx: IUnsignedCommand | ICommand,
): Promise<ICommandResult> => {
  if (isSignedTransaction(tx)) {
    const transactionDescriptor = await client.submit(tx);
    const response = await client.listen(transactionDescriptor);
    if (response.result.status === 'failure') {
      throw response.result.error;
    }
    return response;
  } else {
    throw new Error('Transaction is not signed');
  }
};
