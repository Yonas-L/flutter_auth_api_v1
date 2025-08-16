import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
  private users = new Map();

  async findByEmail(email: string): Promise<any | null> {
    return Array.from(this.users.values()).find(user => user.email === email) || null;
  }

  async create(userData: any): Promise<any> {
    const user = {
      _id: Date.now().toString(),
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(user._id, user);
    return user;
  }

  async findById(id: string): Promise<any | null> {
    return this.users.get(id) || null;
  }

  async updateById(id: string, updateData: any): Promise<any | null> {
    const user = this.users.get(id);
    if (user) {
      const updated = { ...user, ...updateData, updatedAt: new Date() };
      this.users.set(id, updated);
      return updated;
    }
    return null;
  }
}
