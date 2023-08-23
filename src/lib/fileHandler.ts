import axios, {
  AxiosError, AxiosPromise,
  AxiosRequestConfig,
  AxiosResponse,
  CancelTokenSource,
} from "axios";
import localforage from "localforage";

import { FileDownload } from "@web/ig-proto/proto/FileDownload_pb";
import {File, File as ProtoFile, RoomMessage} from "@web/ig-proto/proto//Global_pb";
// import store from "../store";
import {SocketClient, SocketClient as Client} from "@web/ig-proto";
// import { restHandler } from "@utilities/rest";
// import { getGlobal } from "@global/index";
export const FILE_BASEURL = `https://gate.igap.net/files/v1.0`;
export const FILE_UPLOAD = `${FILE_BASEURL}/upload/{{token}}`;
export const FILE_INIT_UPLOAD = `${FILE_BASEURL}/init`;
export const FILE_INIT_RESUME = `${FILE_BASEURL}/init/{{token}}`;
export const FILE_DOWNLOAD = `${FILE_BASEURL}/download/{{token}}?selector={{selector}}`;

export const attachment : File.AsObject = {
  token: '',
  name: '',
  size: 232424,
  largeThumbnail:undefined,
  smallThumbnail: undefined,
  waveformThumbnail: undefined,
  width: 190,
  height: 102,
  duration: 2,
  cacheId: 'i34343',
  mime: "image/jpeg",
  publicUrl: '',
}



export const restHandler = (
    request: any,
    authorization = true,
    aiAuthorization = false
): AxiosPromise => {
  return new Promise((resolve, reject) => {
    if (authorization && SocketClient.token === undefined) {
      setTimeout(
          () => restHandler(request, authorization).then(resolve).catch(reject),
          1000
      );
      return;
    }
    // request = setRestParams(request, authorization, aiAuthorization);
    const handler = axios(request);
    handler.then(resolve);
    handler.catch((error: any) => {
      reject(error);
      // handleOnError(error);
    });
  });
};


export const downloadedFiles: { [key in string]: string } = {};
export const idb = localforage.createInstance({ name: "cachedFiles" });

export type FileStatusType = "started" | "paused" | "canceled" | "finished";
export type FileType =
  | "file"
  | "avatar"
  | "sticker"
  | "thumbnail"
  | "video"
  | "music";
export type FileOptions = { isVideo: boolean; fileType: FileType };
const defaultOptions: FileOptions = { isVideo: false, fileType: "file" };

const FILE_UPLOAD_STATUS_FAILED = 407;
const FILE_UPLOAD_STATUS_UPLOADING = 408;
const FIlE_UPLOADED_COMPLETELY = 406;
const MAX_FILE_SIZE_EXCEEDED = 451;

const progressToPercent: any = () => {};

export class FileBase {
  protected _fileOptions?: FileOptions;
  protected chunkSize: number = 1024 * 512;
  protected onCatches: Array<() => void> = [];
  protected onFinishes: Array<(decrypted: string) => void> = [];
  protected onProgresses: Array<(percent?: number) => void> = [];
  protected onFilesSaved: Array<(token: string) => void> = [];
  protected from: number = 0;
  protected isVideo: boolean = false;
  protected selector: FileDownload.AsObject["selector"];
  protected retryCount: number = 0;
  protected retryDelay: number = 5000;
  protected retryLimit: number = 1;
  protected size: ProtoFile.AsObject["size"];
  protected status: FileStatusType = "paused";
  protected symmetricKey: string | undefined = Client.instance.getSymmetricKey;
  protected init: (() => void) | undefined = undefined;
  protected cancelToken?: CancelTokenSource;
  public token: ProtoFile.AsObject["token"] = "";

  constructor(
    size: ProtoFile.AsObject["size"],
    selector: FileDownload.AsObject["selector"],
    fileOptions: FileOptions = defaultOptions
  ) {
    this.size = size;
    this.selector = selector;
    this.isVideo = !!fileOptions.isVideo;
    this.chunkSize = this.calcChunkSize(size);
    this._fileOptions = fileOptions;
  }

  public start = (): void => {
    if (this.status !== "started") {
      this.cancelToken = axios.CancelToken.source();
      this.init?.();
    }
  };

  public pause(): void {
    this.setStatus("paused");
    this.cancelToken?.cancel();
    this.cancelToken = undefined;
  }

  public cancel(): void {
    this.setStatus("canceled");
  }

  public onCatch = (onCatch: () => void): void => {
    this.onCatches.push(() => {
      onCatch();
      this.reset();
    });
  };

  public onFinish = (callback: (token: string) => void): void => {
    this.onFinishes.push((token) => {
      callback(token);
      this.setFrom(this.size);
      this.setStatus("finished");
    });
  };

  public onProgress = (callback: (percent?: number) => void): void => {
    this.onProgresses.push((percent) => {
      callback(percent);
    });
    this.updateProgress();
  };

  public onFileSaved = (callback: (token: string) => void): void => {
    this.onFilesSaved.push((token) => callback(token));
  };

  protected doCatch(): void {
    this.onCatches.forEach((callback) => {
      callback();
      this.onCatches = this.onCatches.filter((f) => f !== callback);
    });
  }

  protected doFinish(urlOrToken: string): void {
    this.onFinishes.forEach((callback) => {
      callback(urlOrToken);
      this.onFinishes = this.onFinishes.filter((f) => f !== callback);
    });
  }

  protected doProgress(percent?: number): void {
    this.onProgresses.forEach((callback) => {
      callback(percent);
      if (percent === 100) {
        this.onProgresses = this.onProgresses.filter((f) => f !== callback);
      }
    });
  }

  protected doFileSaved(token: string): void {
    this.onFilesSaved.forEach((callback) => {
      callback(token);
      this.onFilesSaved = this.onFilesSaved.filter((f) => f !== callback);
    });
  }

  protected reset(): void {
    this.setFrom(0);
  }

  protected calcChunkSize = (size: number): number => {
    const megabyte = 1024 * 1024;
    let chunkSize = megabyte;
    if (size >= 50 * megabyte) {
      chunkSize = 5 * megabyte;
    } else if (size >= 40 * megabyte) {
      chunkSize = 4 * megabyte;
    } else if (size >= 30 * megabyte) {
      chunkSize = 3 * megabyte;
    } else if (size >= 20 * megabyte) {
      chunkSize = 2 * megabyte;
    }
    return chunkSize;
  };

  protected setStatus = (status: FileStatusType): void => {
    this.status = status;
    this.updateProgress();
  };

  protected setFrom = (value: number): void => {
    this.from = value;
    this.updateProgress();
  };

  protected updateProgress = (progress?: number): void => {
    if (progress) {
      this.doProgress(progress);
      return;
    }
    if (this.status === "canceled") {
      this.doProgress(undefined);
    } else if (this.status !== "paused" || this.from > 0) {
      this.doProgress(Math.floor((this.from / this.size) * 100));
    }
  };

  protected runByStatus = (callback: () => void): void => {
    if (this.status === "paused" || !Client.instance.isLoggedIn) {
      setTimeout(this.runByStatus, 1000, callback);
    } else if (this.status === "started") {
      callback();
    }
  };

  protected saveToCache = (data: Blob): Promise<unknown> => {
    const key = `${this._fileOptions?.fileType}__${this.token}`;
    const promise: Promise<Blob | null> = idb.getItem(key);
    promise.then((file) => {
      if (file === null || file.size < data.size) {
        downloadedFiles[key] = URL.createObjectURL(data);
        idb.setItem(key, data).then(() => this.doFileSaved(this.token));
      }
    });
    return promise;
  };

  protected getFromCache = (): Promise<Blob | null> => {
    let key = `${this._fileOptions?.fileType}__${this.token}`;
    const promise: Promise<Blob | null> = idb.getItem(key);
    promise.then((file) => {
      if (file !== null && downloadedFiles[key] === undefined) {
        downloadedFiles[key] = URL.createObjectURL(file);
      }
    });
    return promise;
  };

  public checkFileDownloaded = (selector?: number): Promise<Blob> => {
    let key = `${this._fileOptions?.fileType}__${this.token}`;
    return new Promise((resolve, reject) => {
      const promise: Promise<Blob | null> = idb.getItem(key);
      promise.then((file) => {
        if (file && file instanceof Blob) resolve(file);
        else reject();
      });
    });
  };
}

export class FileGet extends FileBase {
  static instances: { [token in string]: FileGet } = {};
  protected decrypted: Uint8Array = new Uint8Array(0);
  protected instanceId: string;
  protected readonly mime?: ProtoFile.AsObject["mime"];
  protected readonly publicUrl: ProtoFile.AsObject["publicUrl"];
  protected readonly useCDN: boolean;

  constructor(
    file: Omit<
      ProtoFile.AsObject,
      "cacheId" | "width" | "duration" | "height" | "name"
    >,
    selector: FileDownload.AsObject["selector"] = FileDownload.Selector.FILE,
    options: FileOptions = defaultOptions
  ) {
    super(file.size, selector, options);

    this.selector = selector;

    if (
      selector === FileDownload.Selector.SMALL_THUMBNAIL &&
      file.smallThumbnail === undefined
    ) {
      if (file.largeThumbnail !== undefined) {
        this.selector = FileDownload.Selector.LARGE_THUMBNAIL;
      } else {
        this.selector = FileDownload.Selector.FILE;
      }
    } else if (
      selector === FileDownload.Selector.LARGE_THUMBNAIL &&
      file.largeThumbnail === undefined
    ) {
      if (file.smallThumbnail !== undefined) {
        this.selector = FileDownload.Selector.SMALL_THUMBNAIL;
      } else {
        this.selector = FileDownload.Selector.FILE;
      }
    }

    switch (this.selector) {
      case FileDownload.Selector.LARGE_THUMBNAIL: {
        this.mime = file.largeThumbnail!.mime;
        this.size = file.largeThumbnail!.size;
        break;
      }
      case FileDownload.Selector.SMALL_THUMBNAIL: {
        this.mime = file.smallThumbnail!.mime;
        this.size = file.smallThumbnail!.size;
        break;
      }
      case FileDownload.Selector.WAVEFORM_THUMBNAIL: {
        this.mime = file.waveformThumbnail!.mime;
        this.size = file.waveformThumbnail!.size;
        break;
      }
      default: {
        this.mime = file.mime;
        this.size = file.size;
      }
    }
    this.publicUrl = file.publicUrl;
    this.token = file.token;
    this.useCDN = false;
    // file.publicUrl !== undefined &&
    // file.publicUrl.length > 0 &&
    // selector === FileDownload.Selector.FILE;

    const instanceId = `${options?.fileType}__${file.token}`;
    this.instanceId = instanceId;
    if (FileGet.instances[instanceId] !== undefined) {
      return FileGet.instances[instanceId];
    }
    FileGet.instances[instanceId] = this;
  }

  public deleteFileInstance = () => delete FileGet.instances[this.instanceId];

  protected doFinish(url: string): void {
    const key = `${this._fileOptions?.fileType}__${this.token}`;
    if (downloadedFiles[key] === undefined) {
      downloadedFiles[key] = url;
    } else {
      url = downloadedFiles[key];
    }
    super.doFinish(url);
  }

  protected init = async (): Promise<void> => {
    const file = (await this.getFromCache()) as Blob;
    if (file !== null && file.size >= this.size) {
      this.doFileSaved(this.token);
      this.doFinish(URL.createObjectURL(file));
      return;
    }
    if (this.from < this.size) {
      this.setStatus("started");
      this.requestDownload();
    }
  };

  protected handleError = (
    status: AxiosResponse["status"] | undefined
  ): void => {
    if (`${status}`.startsWith("5")) {
      this.reset();
    }
    if (status !== undefined) {
      this.retryCount++;
    }
    if (this.retryCount <= this.retryLimit) {
      setTimeout(this.init, this.retryDelay);
    } else {
      this.doCatch();
    }
  };

  protected requestDownload = (): void => {
    this.runByStatus(() => {
      this.symmetricKey = Client.instance.getSymmetricKey;
      let end = this.from + this.chunkSize;
      if (end > this.size) end = this.size;
      restHandler(
        {
          method: "GET",
          url: this.useCDN ? this.publicUrl : FILE_DOWNLOAD,
          responseType: "arraybuffer",
          urlParams: { selector: `${this.selector}`, token: this.token },
          headers: { Range: `bytes=${this.from}-${end}` },
          cancelToken: this.cancelToken?.token,
        },
        !this.useCDN
      )
        .then((res) => {
          const prevLength = this.decrypted.byteLength;
          const newChunk = this.useCDN
            ? new Uint8Array(res.data)
            : this.getDecryptedFile(res.data as ArrayBuffer);
          const decrypted = new Uint8Array(prevLength + newChunk.byteLength);
          decrypted.set(this.decrypted);
          decrypted.set(newChunk, prevLength);
          this.decrypted = decrypted;
          if (this.decrypted.byteLength > this.size) {
            this.decrypted = this.decrypted.slice(0, this.size);
          }
          this.setFrom(this.from + this.chunkSize + 1);
          if (this.from >= this.size) {
            const blob = new Blob([this.decrypted], { type: this.mime });
            this.saveToCache(blob).then(() => {
              this.doFinish(URL.createObjectURL(blob));
            });
          } else {
            this.requestDownload();
          }
        })
        .catch((error: AxiosError) => this.handleError(error.response?.status));
    });
  };

  protected getDecryptedFile = (data: ArrayBuffer): Uint8Array => {
    return Client.instance._decrypt(
      data as ArrayBuffer,
      "download",
      this.symmetricKey
    );
  };
}

export class FileSend extends FileBase {
  static instances: { [token in string]: FileSend } = {};
  protected readonly file: File.AsObject;
  protected instanceId: string = "";
  private sendInChunks: boolean = true;

  constructor(file: File.AsObject, options: FileOptions = defaultOptions) {
    super(file.size, FileDownload.Selector.FILE, options);
    this.file = file;
    this.size = file.size;

    let end = this.from + this.chunkSize;
    if (this.file.size < 50000000 || end > this.size) {
      this.sendInChunks = false;
    }
  }

  public clearInstance = () => delete FileSend.instances[this.instanceId];

  public getRawFile = (): File.AsObject => {
    return this.file;
  };

  protected init = (): void => {
    if (this.status === "finished") {
      this.doFileSaved(this.token);
      this.doFinish(this.token);
      return;
    }
    this.setStatus("started");
    this.runByStatus(() => {
      if (this.from < this.size) {
        console.log("[init]", this.token);
        this.token === "" ? this.requestInitUpload() : this.requestInitResume();
      } else if (this.token !== "") {
        this.doFinish(this.token);
      }
    });
  };

  protected reset = (): void => {
    super.reset();
    this.token = "";
  };

  protected handleError = (
    status: AxiosResponse["status"] | undefined
  ): void => {
    console.group("HandleFileError");
    if (status !== undefined && status !== FIlE_UPLOADED_COMPLETELY) {
      console.log("1");
      this.retryCount++;
      if (this.retryCount > this.retryLimit) {
        console.log("2");

        this.doCatch();
        return;
      }
    }
    let callback;

    if (status === undefined && this.cancelToken !== undefined) {
      console.log("3");

      callback = this.init;
    } else if (status === FILE_UPLOAD_STATUS_UPLOADING) {
      console.log("4");

      callback = () => {};
    } else if (status === FIlE_UPLOADED_COMPLETELY) {
      console.log("5");

      this.doFinish(this.token);
    } else if (
      (status !== undefined &&
        [MAX_FILE_SIZE_EXCEEDED, FILE_UPLOAD_STATUS_FAILED].includes(status)) ||
      `${status}`.startsWith("5")
    ) {
      console.log("6");

      this.reset();
      callback = this.init;
    }
    console.log("7", callback);

    callback && setTimeout(callback, this.retryDelay);
  };

  protected requestInitUpload = (): void => {
    restHandler({
      method: "POST",
      url: FILE_INIT_UPLOAD,
      data: { size: this.size, name: this.file.name },
      cancelToken: this.cancelToken?.token,
    })
      .then((res) => {
        this.token = res?.data?.token || "";
        FileSend.instances[this.token] = this;
        // this.saveToCache(new Blob([this.file], { type: this.file.type })).then(
        //   () => {
        //     this.requestUpload();
        //   }
        // );
      })
      .catch((error: AxiosError) => this.handleError(error.response?.status));
  };

  onRequestProgress = (ev: any) => {
    this.updateProgress(parseInt(progressToPercent(ev)));
  };

  protected requestInitResume = (): void => {
    restHandler({
      method: "GET",
      url: FILE_INIT_RESUME,
      urlParams: { token: this.token },
      cancelToken: this.cancelToken?.token,
    })
      .then((res: any) => {
        this.setFrom(parseInt(res?.data?.uploaded_size));
        this.requestUpload();
      })
      .catch((error: AxiosError) => this.handleError(error.response?.status));
  };

  protected requestUpload = (): void => {
    if (this.cancelToken === undefined)
      this.cancelToken = axios.CancelToken.source();
    this.runByStatus(async () => {
      restHandler({
        method: "POST",
        url: FILE_UPLOAD,
        onUploadProgress: this.sendInChunks
          ? undefined
          : this.onRequestProgress,
        urlParams: { token: this.token },
        data: await this.getEncryptedFile(),
        cancelToken: this.cancelToken?.token,
      })
        .then(() => {
          if (!this.sendInChunks || this.from + this.chunkSize >= this.size) {
            this.doFinish(this.token);
          } else {
            this.requestInitResume();
          }
        })
        .catch((error: AxiosError) => this.handleError(error.response?.status));
    });
  };

  protected getChunkedFile = (): Promise<ArrayBuffer> => {
    let end = this.from + this.chunkSize;
    if (!this.sendInChunks) {
      end = this.size;
    }
    const chunked = (
      (this.file as any).mozSlice ||
      (this.file as any).webkitSlice
      // ||
      // this.file?.slice
    ).bind(this.file)(this.from, end);
    return new Promise((resolve) => {
      if (chunked.arrayBuffer !== undefined) {
        return resolve(chunked.arrayBuffer());
      }
      let fr = new FileReader();
      fr.onload = () => {
        // @ts-ignore
        resolve(fr.result);
      };
      fr.readAsArrayBuffer(chunked);
    });
  };

  protected getEncryptedFile = async (): Promise<Uint8Array> => {
    let bufferedData = await this.getChunkedFile();
    return Client.instance._encrypt(bufferedData, "upload");
  };
}

export const clearAllFiles = (): void => {
  idb.clear().then();
};

export const clearMessageFiles = (
  messageId: RoomMessage.AsObject["messageId"]
): void => {
  // const token = getGlobal().messages.byId[messageId]?.attachment?.token;
  // if (token !== undefined) {
  //   idb.removeItem(`${token}`).then();
  //   idb.removeItem(`${token}-${FileDownload.Selector.FILE}`).then();
  // }
};
