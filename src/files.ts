import StreamClient, { OnUploadProgress } from './client';

export default class StreamFileStore {
  client: StreamClient;
  token: string;

  constructor(client: StreamClient, token: string) {
    this.client = client;
    this.token = token;
  }

  // React Native does not auto-detect MIME type, you need to pass that via contentType
  // param. If you don't then Android will refuse to perform the upload
  upload(
    uri: string | File | NodeJS.ReadStream,
    name?: string,
    contentType?: string,
    onUploadProgress?: OnUploadProgress,
  ) {
    /**
     * upload a File instance or a readable stream of data
     * @param {File|Buffer|string} uri - File object or Buffer or URI
     * @param {string} [name] - file name
     * @param {string} [contentType] - mime-type
     * @param {function} [onUploadProgress] - browser only, Function that is called with upload progress
     * @return {Promise}
     */
    return this.client.upload('files/', uri, name, contentType, onUploadProgress);
  }

  delete(uri: string) {
    return this.client.delete({
      url: `files/`,
      qs: { url: uri },
      signature: this.token,
    });
  }
}
