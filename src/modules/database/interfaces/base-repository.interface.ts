export interface BaseRepository<T, CreateData = Partial<T>, UpdateData = Partial<T>> {
    findById(id: string): Promise<T | null>;
    findMany(filters?: Partial<T>): Promise<T[]>;
    create(data: CreateData): Promise<T>;
    update(id: string, data: UpdateData): Promise<T | null>;
    delete(id: string): Promise<boolean>;
}
