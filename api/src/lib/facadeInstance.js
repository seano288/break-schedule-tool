import { TableStorageFacade } from '../facades/TableStorageFacade.js';

let facadePromise;

/** Lazily creates and initializes the shared TableStorageFacade for this Functions host instance. */
export function getFacade() {
    if (!facadePromise) {
        const facade = new TableStorageFacade(process.env.TABLE_STORAGE_CONNECTION_STRING);
        facadePromise = facade.init().then(() => facade);
    }
    return facadePromise;
}
